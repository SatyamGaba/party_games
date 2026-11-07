import { useEffect, useState, Suspense, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, useTheme } from "next-themes";
import {
  ArrowUpRight,
  Dice5,
  Monitor,
  Users,
  Sparkles,
  Check,
  ArrowRight,
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
} from "../components/ui";
import { useRoomConnection, enterRoom } from "../platform/client/session";
import { clientGames } from "../games/registry.client";
import { clientError } from "../lib/errors";
import "@fontsource-variable/inter";
import "./styles.css";
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
  const [modal, setModal] = useState<"create" | "join" | "display" | null>(
    params.has("room")
      ? params.get("screen") === "tv"
        ? "display"
        : "join"
      : null,
  );
  const [gameId, setGameId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState(params.get("room") ?? "");
  const [busy, setBusy] = useState(false);
  const game = room ? clientGames[room.snapshot.gameId] : null;
  useEffect(() => {
    if (room) setModal(null);
  }, [room?.code]);
  async function enter(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await enterRoom({
        gameId: modal === "create" ? gameId : undefined,
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
  return (
    <div className="shell">
      <ThemeColor />
      <header className="site-header">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            if (room) e.preventDefault();
          }}
        >
          <span className="brand-mark">
            <Dice5 size={24} />
          </span>
          Party<span className="brand-sub">/ good company</span>
        </a>
        <div className="header-right">
          <span className={"status-dot " + (online && ready ? "live" : "")} />
          <span className="connection-label">
            {online && ready
              ? room
                ? "Connected"
                : "Ready to play"
              : "Connecting…"}
          </span>
          <ThemeMenu />
          {room && (
            <Button variant="secondary" size="small" onClick={leave}>
              Leave room
            </Button>
          )}
        </div>
      </header>
      {error && !modal && (
        <Notice onDismiss={() => setError("")}>{error}</Notice>
      )}
      {!online && room && (
        <Notice>
          Connection lost. Reconnecting automatically. Your locked answer is
          saved on the server.
        </Notice>
      )}
      {room && game ? (
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
            eyebrow="YOUR PEOPLE. YOUR GAME NIGHT."
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
          <div className="home-actions">
            <Button variant="primary" onClick={() => setModal("join")}>
              Join a room <ArrowUpRight size={19} />
            </Button>
            <Button variant="secondary" onClick={() => setModal("display")}>
              <Monitor size={19} /> Open on a TV
            </Button>
          </div>
          <section className="shelf">
            <div className="section-heading">
              <h2>Pick your next obsession</h2>
              <span>{Object.keys(clientGames).length} GAME · NO DOWNLOADS</span>
            </div>
            <div className="game-grid">
              {Object.values(clientGames).map(({ manifest }) => (
                <Card className="game-card" key={manifest.id}>
                  <div className="card-art">
                    <Badge>THE GAME NIGHT STARTER</Badge>
                    <div className="art-halo" />
                    <Dice5 className="hero-die" strokeWidth={1.3} />
                    <Sparkles className="art-sparkle" />
                    <span className="art-caption">
                      A little luck. A lot of cheering.
                    </span>
                  </div>
                  <div className="card-body">
                    <div className="tags">
                      <Badge>
                        <Users size={13} /> {manifest.minPlayers}–
                        {manifest.maxPlayers} players
                      </Badge>
                      <Badge>
                        <Monitor size={13} /> Shared screen
                      </Badge>
                    </div>
                    <h3>{manifest.name}</h3>
                    <p>{manifest.description}</p>
                    <Button
                      variant="primary"
                      className="card-play"
                      disabled={!ready}
                      onClick={() => {
                        setGameId(manifest.id);
                        setModal("create");
                      }}
                    >
                      Start a room <ArrowRight size={19} />
                    </Button>
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
                    ["Start something good.", "Pick a game and create a room."],
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
            <span>Bring snacks. We brought the games.</span>
          </footer>
        </main>
      )}
      <Modal
        open={modal !== null && !room}
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
            ? "You'll be the host and a player. Share your room code to get everyone in."
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
                  setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                }
                className="code-input"
                maxLength={5}
                minLength={5}
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
