import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Router } from "express";
import { parse } from "yaml";
import { z } from "zod";
import type { PackInfo, Question } from "./shared";

const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/);
const points = z.number().int().min(0).max(10000);
const questionSchema = z
  .object({
    id,
    prompt: z.string().trim().min(1).max(4000),
    answer: z.string().trim().min(1).max(4000),
    type: z.enum(["text", "image", "audio", "video"]).default("text"),
    text: z.string().max(4000).optional(),
    media: z.string().min(1).max(300).optional(),
    start: z.number().min(0).max(86400).default(0),
    end: z.number().positive().max(86400).optional(),
    reward: points.default(10),
    penalty: points.default(5),
  })
  .strict()
  .superRefine((q, context) => {
    if (q.type !== "text" && !q.media)
      context.addIssue({
        code: "custom",
        message: "Media questions need a local media file.",
      });
    if (q.end !== undefined && q.end <= q.start)
      context.addIssue({
        code: "custom",
        message: "Clip end must be after its start.",
      });
  });
const packSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    questions: z.array(questionSchema).min(1).max(250),
  })
  .strict()
  .refine(
    (p) => new Set(p.questions.map((q) => q.id)).size === p.questions.length,
    "Question IDs must be unique.",
  );
const extensions: Record<string, string[]> = {
  image: [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"],
  audio: [".mp3", ".wav", ".ogg", ".m4a", ".flac", ".webm"],
  video: [".mp4", ".webm", ".ogv"],
};
export const packsDirectory = () => resolve(process.env.PACKS_DIR ?? "packs");
export const mediaDirectory = () =>
  resolve(process.env.DATA_DIR ?? "data", "fff-media");
async function contained(root: string, relative: string) {
  const target = await realpath(resolve(root, relative));
  if (!target.startsWith(root + sep))
    throw new Error("Pack paths must stay inside their pack folder.");
  return target;
}
async function readPack(packId: string) {
  id.parse(packId);
  const base = await realpath(packsDirectory());
  const directory = await contained(base, packId);
  const path = await contained(directory, "questions.yaml");
  if ((await stat(path)).size > 1024 * 1024)
    throw new Error("Question file exceeds 1 MB.");
  const raw = packSchema.parse(
    parse(await readFile(path, "utf8"), { maxAliasCount: 0 }),
  );
  const questions: Question[] = raw.questions.map((q) => ({
    ...q,
    text: q.text ?? (q.type === "text" ? q.prompt : ""),
  }));
  for (const question of questions)
    if (question.media) {
      const file = await contained(directory, question.media);
      const details = await stat(file);
      if (!details.isFile() || details.size > 200 * 1024 * 1024)
        throw new Error("Media must be a regular file of at most 200 MB.");
      if (!extensions[question.type]?.includes(extname(file).toLowerCase()))
        throw new Error("Unsupported media format for " + question.id + ".");
    }
  return { id: packId, title: raw.title, directory, questions };
}
export async function listPacks(): Promise<{
  packs: PackInfo[];
  errors: string[];
}> {
  let entries;
  try {
    entries = await readdir(packsDirectory(), { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return {
        packs: [],
        errors: ["No pack folder found. Add packs to PACKS_DIR, then refresh."],
      };
    throw error;
  }
  const packs: PackInfo[] = [],
    errors: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || !id.safeParse(entry.name).success) continue;
    try {
      const pack = await readPack(entry.name);
      packs.push({
        id: pack.id,
        title: pack.title,
        count: pack.questions.length,
      });
    } catch {
      errors.push(
        entry.name +
          ": invalid questions.yaml or missing/unsupported media. Check the pack guide.",
      );
    }
  }
  return { packs, errors };
}
/** Copy and hash in a single stream: an active game never references mutable source media. */
async function snapshotMedia(source: string) {
  const directory = mediaDirectory();
  await mkdir(directory, { recursive: true });
  const temporary = join(directory, "." + randomUUID());
  const hash = createHash("sha256");
  let bytes = 0;
  try {
    await pipeline(
      createReadStream(source),
      new Transform({
        transform(chunk, _encoding, callback) {
          bytes += chunk.length;
          if (bytes > 200 * 1024 * 1024)
            return callback(new Error("Media exceeds 200 MB."));
          hash.update(chunk);
          callback(null, chunk);
        },
      }),
      createWriteStream(temporary, { flags: "wx" }),
    );
    const filename = hash.digest("hex") + extname(source).toLowerCase();
    await rename(temporary, join(directory, filename));
    return "/fff-media/" + filename;
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}
export async function loadPack(packId: string) {
  const pack = await readPack(packId);
  const media = new Map<string, string>();
  for (const question of pack.questions)
    if (question.media && !media.has(question.media)) {
      media.set(
        question.media,
        await snapshotMedia(await contained(pack.directory, question.media)),
      );
    }
  return { id: pack.id, title: pack.title, questions: pack.questions, media };
}
export type LoadedPack = Awaited<ReturnType<typeof loadPack>>;

/** Only immutable media is public. Question manifests and prepared answers have no HTTP route. */
export function packMediaRouter() {
  const router = Router();
  router.get("/fff-media/:file", (req, res) => {
    const file = req.params.file;
    if (
      !/^[a-f0-9]{64}\.(jpg|jpeg|png|webp|gif|avif|mp3|wav|ogg|m4a|flac|webm|mp4|ogv)$/.test(
        file,
      )
    ) {
      res.sendStatus(404);
      return;
    }
    res.sendFile(
      file,
      {
        root: mediaDirectory(),
        dotfiles: "deny",
        maxAge: "1y",
        immutable: true,
      },
      (error) => {
        if (error && !res.headersSent) res.sendStatus(404);
      },
    );
  });
  return router;
}
