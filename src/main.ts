import './ui/bootguard.ts';
import './content/index.ts';
import { App } from './ui/app.ts';

const stage = document.getElementById('stage')!;
const app = new App(stage);
document.getElementById('boot')?.remove();
app.title();
if (import.meta.env.DEV) {
  const { chooseRunAction } = await import('./ai/runbot.ts');
  const { waitingOn } = await import('./run/game.ts');
  /** Lets the bot take actions through the session, so the screens animate as they would for a player. */
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      const s = app.session;
      if (!s || s.game.run.over) return 'over';
      const seat = waitingOn(s.game)[0];
      if (seat === undefined) return 'nobody is waiting';
      const err = s.send(seat, chooseRunAction(s.game, seat, { limit: 80 }));
      if (err) return err;
    }
    return app.session?.game.run.screen;
  };
  const untilScreen = (screen: string, max = 3000) => {
    for (let i = 0; i < max; i++) {
      if (app.session?.game.run.screen === screen) return screen;
      const r = step();
      if (r === 'over') return r;
    }
    return app.session?.game.run.screen;
  };
  let auto: ReturnType<typeof setInterval> | null = null;
  /** Lets the bot act for this tab's own seats every `ms`, which is how a co-op game is tested with two tabs. */
  const autoplay = (ms = 120) => {
    if (auto) clearInterval(auto);
    auto = setInterval(() => {
      const s = app.session;
      if (!s || s.game.run.over) return;
      const seat = waitingOn(s.game).find((x) => s.mine.includes(x));
      if (seat === undefined) return;
      s.send(seat, chooseRunAction(s.game, seat, { limit: 60 }));
    }, ms);
    return () => auto && clearInterval(auto);
  };
  const shotMode = (pan: number | false = 0) => {
    app.shotMode = pan;
    app.fit();
  };
  (window as unknown as { dev: unknown }).dev = { app, step, untilScreen, autoplay, shotMode };
}
(window as unknown as { app: App }).app = app;
