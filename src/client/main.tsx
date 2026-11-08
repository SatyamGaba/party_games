import { useEffect, useState, Suspense, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { Button as PrimitiveButton } from "@base-ui/react/button";
import { ThemeProvider, useTheme } from "next-themes";
import {
  ArrowUpRight,
  Monitor,
  Users,
  Check,
  ArrowRight,
  ArrowLeft,
  Maximize,
  Minimize,
  Play,
} from "lucide-react";
import {
  Button,
  Input,
  Modal,
  Card,
  Badge,
  Notice,
  PageHeader,
  ThemeMenu,
  ConnectionStatus,
} from "../components/ui";
import { useRoomConnection, enterRoom } from "../platform/client/session";
import { clientGames } from "../games/registry.client";
import { clientError } from "../lib/errors";
import "@fontsource-variable/inter";
import "./styles.css";
function GameArtwork({ thumbnail }: { thumbnail: string }) {
  return (
    <>
      <span className="thumbnail-art" aria-hidden="true">
        <img className="thumbnail-image" src={thumbnail} alt="" decoding="async" />
        <img className="thumbnail-edge" src={thumbnail} alt="" decoding="async" />
      </span>
      <span className="thumbnail-play" aria-hidden="true">
        <Play size={30} fill="currentColor" strokeWidth={1.5} />
      </span>
    </>
  );
}
function ThemeColor() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        "content",
        resolvedTheme === "dark" ? "#1f1f23" : "#fdf6f4",
      );
  }, [resolvedTheme]);
  return null;
}
function App() {
  const { room, online, ready, error, setError, send, leave } =
    useRoomConnection();
  const params = new URLSearchParams(location.search);
  const [modal, setModal] = useState<
    "choose" | "create" | "join" | "display" | null
  >(
    params.has("room") && params.get("game") && clientGames[params.get("game")!]
      ? params.get("screen") === "tv"
        ? "display"
        : "join"
      : null,
  );
  const [gameId, setGameId] = useState(
    clientGames[params.get("game") ?? ""] ? params.get("game")! : "",
  );
  const [name, setName] = useState("");
  const [code, setCode] = useState(params.get("room") ?? "");
  const [busy, setBusy] = useState(false);
  const game = room ? clientGames[room.snapshot.gameId] : null;
  const tv = room?.role === "display";
  const launcher = !room && location.pathname === "/tv";
  useEffect(() => {
    if (room) setModal(null);
  }, [room?.code]);
  useEffect(() => {
    if (tv || launcher) document.documentElement.dataset.mode = "tv";
    else delete document.documentElement.dataset.mode;
  }, [tv, launcher]);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  }
  async function enter(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await enterRoom({
        gameId: modal === "create" ? gameId : undefined,
        joinGameId: modal === "create" ? undefined : gameId,
        code,
        name,
        role: modal === "display" ? "display" : "player",
      });
    } catch (error) {
      setError(clientError(error));
    } finally {
      setBusy(false);
    }
  }
  async function hostFromTv() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await enterRoom({ gameId, role: "display", name: "" });
    } catch (error) {
      setError(clientError(error));
    } finally {
      setBusy(false);
    }
  }
  const chosen = clientGames[gameId]?.manifest;
  const dialogs = (
    <>
      <Modal
        open={modal === "choose" && !room && !!chosen}
        onClose={() => setModal(null)}
        title={chosen?.name ?? ""}
        description="Start a new game, or jump into one that's already running."
      >
        <div className="choose-actions">
          <Button
            variant="primary"
            className="full"
            disabled={busy || !ready}
            onClick={() => (launcher ? void hostFromTv() : setModal("create"))}
          >
            Host a game <ArrowRight size={18} />
          </Button>
          <Button
            variant="secondary"
            className="full"
            disabled={!ready}
            onClick={() => {
              setError("");
              setModal(launcher ? "display" : "join");
            }}
          >
            Join existing game <ArrowUpRight size={18} />
          </Button>
          {error && <Notice>{error}</Notice>}
        </div>
      </Modal>
      <Modal
        open={modal !== null && modal !== "choose" && !room}
        onClose={() => setModal(null)}
        title={
          modal === "create"
            ? "Make room for a good time."
            : modal === "display"
              ? "Go big on game night."
              : "You're invited."
        }
        description={
          modal === "create"
            ? chosen?.hostPlays === false
              ? "You'll host and moderate from this phone. Share your room code to get everyone in."
              : "You'll be the host and a player. Share your room code to get everyone in."
            : modal === "display"
              ? "This screen follows the action. Use your phone to play."
              : "Enter your host's room code and choose a name."
        }
      >
        <form onSubmit={enter}>
          {modal !== "create" && (
            <label>
              Room code
              <Input
                value={code}
                onValueChange={(v) =>
                  setCode(v.toUpperCase().replace(/[^A-Z]/g, ""))
                }
                className="code-input"
                maxLength={4}
                minLength={4}
                required
                autoComplete="off"
                autoFocus
              />
            </label>
          )}
          {modal !== "display" && (
            <label>
              Your name
              <Input
                value={name}
                onValueChange={setName}
                maxLength={24}
                required
                autoComplete="nickname"
                autoFocus={modal === "create"}
              />
            </label>
          )}
          {error && <Notice>{error}</Notice>}
          <Button
            type="submit"
            variant="primary"
            className="full"
            disabled={busy || !ready}
          >
            {busy
              ? "Connecting…"
              : modal === "create"
                ? "Create room"
                : modal === "display"
                  ? "Connect screen"
                  : "Join the party"}
            <ArrowRight size={18} />
          </Button>
        </form>
      </Modal>
    </>
  );
  if (launcher)
    return (
      <div className="shell">
        <ThemeColor />
        <header className="tv-header">
          <div className="tv-actions">
            <span className="brand-mark" aria-hidden="true">🎲</span>
            <Button
              variant="secondary"
              size="small"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? "Exit full screen" : "Full screen"}
            >
              {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </Button>
          </div>
          <h1>HouseParty</h1>
          <div className="tv-code">
            <ConnectionStatus live={online && ready} inRoom={!!room} />
            <span>{location.host}</span>
            <ThemeMenu />
          </div>
        </header>
        {error && <Notice onDismiss={() => setError("")}>{error}</Notice>}
        <main className="tv-launcher">
          <p className="eyebrow">PICK A GAME TO HOST</p>
          <div className="tv-grid">
            {Object.values(clientGames).map(({ manifest, thumbnail }) => (
              <PrimitiveButton
                key={manifest.id}
                className="tv-tile"
                aria-label={`Play ${manifest.name}`}
                disabled={!manifest.tv || busy || !ready}
                onClick={() => {
                  setGameId(manifest.id);
                  setError("");
                  setModal("choose");
                }}
              >
                <span className="card-art game-thumbnail">
                  <GameArtwork thumbnail={thumbnail} />
                </span>
                <strong>{manifest.name}</strong>
                <span>
                  {manifest.tv
                    ? manifest.minPlayers +
                      "–" +
                      manifest.maxPlayers +
                      " players"
                    : "Phone only · start it from your phone"}
                </span>
              </PrimitiveButton>
            ))}
          </div>
        </main>
        {dialogs}
      </div>
    );
  return (
    <div className="shell">
      <ThemeColor />
      {tv && room && game ? (
        <header className="tv-header">
          <div className="tv-actions">
            <span className="brand-mark" aria-hidden="true">🎲</span>
            <Button
              variant="secondary"
              size="small"
              onClick={() => {
                if (document.fullscreenElement) void document.exitFullscreen();
                leave();
              }}
            >
              <ArrowLeft size={18} /> Back
            </Button>
            <Button
              variant="secondary"
              size="small"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? "Exit full screen" : "Full screen"}
            >
              {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </Button>
          </div>
          <h1>{game.manifest.name}</h1>
          <div className="tv-code">
            <ConnectionStatus live={online && ready} inRoom={!!room} />
            <span>JOIN AT {location.host}</span>
            <strong>{room.code}</strong>
            <ThemeMenu />
          </div>
        </header>
      ) : (
      <header className="site-header">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            if (room) e.preventDefault();
          }}
        >
          <span className="brand-mark" aria-hidden="true">
            🎲
          </span>
          {room?.snapshot.gameId === "fastest-finger-first"
            ? "Fastest Finger First."
            : "HouseParty"}
        </a>
        <div className="header-right">
          <ConnectionStatus live={online && ready} inRoom={!!room} />
          {!room && (
            <Button
              variant="ghost"
              size="small"
              className="tv-open"
              aria-label="Open on a TV"
              onClick={() => location.assign("/tv")}
            >
              <Monitor size={18} />
              <span className="tv-open-label">TV</span>
            </Button>
          )}
          <ThemeMenu />
          {room && (
            <Button variant="secondary" size="small" onClick={leave}>
              Leave room
            </Button>
          )}
        </div>
      </header>
      )}
      {error && !modal && (
        <Notice onDismiss={() => setError("")}>{error}</Notice>
      )}
      {!online && room && (
        <Notice>
          Connection lost. Reconnecting automatically. Your place, score and
          locked answers are saved on the server.
        </Notice>
      )}
      {!room && !ready && (
        <p className="waiting-note" role="status">
          Getting you back into your room…
        </p>
      )}
      {room && game && room.snapshot.players[room.you]?.waiting ? (
        <main className="home">
          <PageHeader
            eyebrow="WAITING ROOM"
            title={
              <>
                You're in.
                <br />
                <span className="muted-title">Hang tight.</span>
              </>
            }
          />
          <p className="waiting-note" role="status">
            A round of {game.manifest.name} is in progress. You'll join
            automatically as soon as it ends, so you don't miss the next one.
          </p>
        </main>
      ) : room && game ? (
        <Suspense
          fallback={
            <p className="waiting-note" role="status">
              Opening your game…
            </p>
          }
        >
          <game.Screen session={room} connected={online && ready} send={send} />
        </Suspense>
      ) : (
        <main className="home">
          <PageHeader
            title={
              <>
                Good times.
                <br />
                <span className="muted-title">Great company.</span>
              </>
            }
          />
          <p className="intro-copy">
            A little friendly competition goes a long way.
            <br />
            Pick a game, grab your phones, and make a night of it.
          </p>
          <section className="shelf">
            <div className="section-heading">
              <h2>Pick your next obsession</h2>
            </div>
            <div className="game-grid">
              {Object.values(clientGames).map(({ manifest, thumbnail }) => (
                <Card className="game-card" key={manifest.id}>
                  <PrimitiveButton
                    className="card-art game-thumbnail"
                    aria-label={`Play ${manifest.name}`}
                    disabled={!ready}
                    onClick={() => {
                      setGameId(manifest.id);
                      setError("");
                      setModal("choose");
                    }}
                  >
                    <GameArtwork thumbnail={thumbnail} />
                  </PrimitiveButton>
                  <div className="card-body">
                    <div className="tags">
                      <Badge>
                        <Users size={13} /> {manifest.minPlayers}–
                        {manifest.maxPlayers} players
                      </Badge>
                    </div>
                    <h3>{manifest.name}</h3>
                    <p>{manifest.description}</p>
                  </div>
                </Card>
              ))}
              <Card className="how-card">
                <span className="eyebrow">LESS SETUP. MORE PLAY.</span>
                <h3>
                  Your couch.
                  <br />
                  Your crew.
                  <br />
                  <span className="muted-title">Your kind of night.</span>
                </h3>
                <ol>
                  {[
                    ["Start something good.", "Pick a game, then host or join a room."],
                    [
                      "Get everyone together.",
                      "Share the room code. Phones become controllers.",
                    ],
                    [
                      "Make it a big-screen thing.",
                      "Open a TV view so everyone can follow along.",
                    ],
                  ].map(([title, copy], i) => (
                    <li key={title}>
                      <span className="step-number">{i + 1}</span>
                      <div>
                        <strong>{title}</strong>
                        <p>{copy}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="no-download">
                  <Check size={16} /> No accounts. No downloads. Just your
                  people.
                </div>
              </Card>
            </div>
          </section>
          <footer>
            <span>Built for game nights that run a little longer.</span>
          </footer>
        </main>
      )}
      {dialogs}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <ThemeProvider
    attribute="class"
    defaultTheme="system"
    enableSystem
    storageKey="party.theme"
    disableTransitionOnChange
  >
    <App />
  </ThemeProvider>,
);
