import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Trophy,
  Mountain,
  Flag,
  Volume2,
  VolumeX,
  Settings as SettingsIcon,
  Maximize,
  ArrowUpRight,
  Footprints,
  Compass,
  RotateCcw,
  X,
  Check,
  ChevronRight,
  MoveUp,
  Hand,
  Wind,
  Sparkles,
  Map,
  Focus,
  Flame,
  Target,
  Pause,
  Play,
  Backpack,
  ArrowLeft,
  Shield,
  Lock,
} from "lucide-react";
import { CHASE_DURATION } from "./chase";
import { LEVELS } from "./levels";
import { MUSIC_TITLES } from "./music";
import { parseSave, SAVE_KEY, type Settings, type Save } from "./rules";
import type { GameState, createGame } from "./game";
import "./style.css";
import {
  enterLandscape,
  toggleFullscreen,
  MOBILE_QUERY,
  MOBILE_PORTRAIT_QUERY,
} from "./display";
type Mode = "menu" | "play" | "settings" | "help" | "peaks" | "reset" | "pause";
type Game = ReturnType<typeof createGame>;
/** 存储不可用或旧存档损坏时，使用可继续游玩的默认存档。 */
function readSave() {
  try {
    return parseSave(localStorage.getItem(SAVE_KEY));
  } catch {
    return parseSave(null);
  }
}
/** 统一处理长按、取消和丢失指针，避免触屏按钮保持按下状态。 */
function Hold({
  title,
  children,
  onHold,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  onHold: (v: boolean) => void;
  className?: string;
}) {
  return (
    <button
      className={className}
      aria-label={title}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        onHold(true);
      }}
      onPointerUp={() => onHold(false)}
      onPointerCancel={() => onHold(false)}
      onLostPointerCapture={() => onHold(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}
function App() {
  const view = useRef<HTMLDivElement>(null),
    game = useRef<Game | null>(null),
    save = useRef<Save>(readSave());
  const [levelId, setLevelId] = useState(save.current.lastLevel),
    [mode, setMode] = useState<Mode>("menu"),
    [previous, setPrevious] = useState<Mode>("menu");
  const [settings, setSettings] = useState<Settings>(save.current.settings),
    [state, setState] = useState<GameState | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [storageError, setStorageError] = useState(false),
    [retry, setRetry] = useState(0);
  const [, redraw] = useState(0),
    [stick, setStick] = useState({ x: 0, y: 0 });
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const query = matchMedia(MOBILE_PORTRAIT_QUERY),
      mobile = matchMedia(MOBILE_QUERY);
    const requestFullscreen = () => {
      if (mobile.matches && !query.matches && !document.fullscreenElement)
        void enterLandscape();
    };
    const update = () => {
      setPortrait(query.matches);
      requestFullscreen();
    };
    update();
    query.addEventListener("change", update);
    // 浏览器若要求用户手势，横屏后的第一次触摸会立即重试全屏。
    window.addEventListener("pointerdown", requestFullscreen);
    return () => {
      query.removeEventListener("change", update);
      window.removeEventListener("pointerdown", requestFullscreen);
    };
  }, []);
  const level = LEVELS[levelId - 1];
  const persist = () => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save.current));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
    redraw((v) => v + 1);
  };
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setState(null);
    game.current?.dispose();
    game.current = null;
    import("./game")
      .then(({ createGame }) => {
        if (cancelled) return;
        game.current = createGame(
          view.current!,
          level,
          save.current,
          setState,
          persist,
          () => {
            setPrevious("play");
            setMode("reset");
          },
        );
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "场景初始化失败");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      game.current?.dispose();
      game.current = null;
    };
  }, [levelId, retry]);
  useEffect(() => {
    game.current?.menu(
      mode === "menu" || (previous === "menu" && mode !== "play"),
    );
    game.current?.pause(mode !== "play" || loading || portrait);
    setStick({ x: 0, y: 0 });
  }, [mode, previous, loading, portrait]);
  useEffect(() => {
    save.current.settings = settings;
    game.current?.settings(settings);
    persist();
  }, [settings]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        if (mode === "play") {
          setPrevious("play");
          setMode("pause");
        } else if (mode !== "menu") setMode(previous);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [mode, previous]);
  const open = (m: Mode) => {
    setPrevious(mode === "play" ? "play" : "menu");
    setMode(m);
  };
  /** 用户点击时申请横屏；浏览器拒绝时由旋转提示引导。 */
  const play = () => {
    if (matchMedia(MOBILE_QUERY).matches) void enterLandscape();
    save.current.lastLevel = levelId;
    persist();
    setMode("play");
  };
  const choose = (id: number) => {
    if (matchMedia(MOBILE_QUERY).matches) void enterLandscape();
    if (id === levelId) {
      if (state?.won) game.current?.reset();
    } else {
      setState(null);
      setLoading(true);
      setLevelId(id);
    }
    save.current.lastLevel = id;
    persist();
    setPrevious("play");
    setMode("play");
  };
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));
  const joy = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    let x = (e.clientX - r.left - r.width / 2) / 38,
      y = (e.clientY - r.top - r.height / 2) / 38;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    setStick({ x, y });
    game.current?.move(x, y);
  };
  const endJoy = () => {
    setStick({ x: 0, y: 0 });
    game.current?.move(0, 0);
  };
  const won = state?.won ?? false,
    playing = mode === "play" && !won && !loading && !error;
  const close = () => setMode(previous);
  const modal =
    mode === "settings" ||
    mode === "help" ||
    mode === "peaks" ||
    mode === "reset" ||
    mode === "pause" ||
    won;
  return (
    <main
      data-level={levelId}
      className={[
        mode === "menu" ? "menu-mode" : "",
        state?.chase.active || state?.deathInChase ? "chase-mode" : "",
      ].join(" ")}
      style={
        {
          "--control-opacity": settings.opacity,
          "--button-scale": settings.buttonScale,
          "--stamina-angle": `${(state?.stamina ?? 100) * 3.6}deg`,
          "--energy-angle": `${(state?.energy ?? 0) * 3.6}deg`,
        } as React.CSSProperties
      }
    >
      <div ref={view} className="world" />
      {portrait && mode === "play" && !loading && !error && (
        <div
          className="rotate-prompt"
          role="dialog"
          aria-modal="true"
          aria-label="请横屏游玩"
        >
          <RotateCcw size={40} />
          <h2>横过手机，继续攀登</h2>
          <p>已暂停游戏。请开启设备自动旋转，并将手机横放。</p>
          <button className="primary" onClick={() => void enterLandscape()}>
            尝试横屏全屏
          </button>
          <button className="secondary" onClick={() => setMode("menu")}>
            返回菜单
          </button>
        </div>
      )}
      <div className="vignette" />
      <header>
        <button
          className="brand"
          onClick={() => setMode("menu")}
          aria-label="返回主菜单"
        >
          <Mountain size={29} />
          <div>
            山行者<small>THE MOUNTAIN WALKER</small>
          </div>
        </button>
        <div className="chapter">
          <span>四季回响 · {level.season}之章</span>
          <i />
          <b>0{levelId}</b>
          <span>/ 05 座山峰</span>
        </div>
        <nav>
          <button title="选择山峰" onClick={() => open("peaks")}>
            <Map />
          </button>
          <button
            title={settings.muted ? "开启声音" : "关闭声音"}
            onClick={() => update("muted", !settings.muted)}
          >
            {settings.muted ? <VolumeX /> : <Volume2 />}
          </button>
          <button
            className="fullscreen"
            title="全屏"
            onClick={() => void toggleFullscreen()}
          >
            <Maximize />
          </button>
          <button title="设置" onClick={() => open("settings")}>
            <SettingsIcon />
          </button>
          {mode === "play" && (
            <button title="暂停" onClick={() => open("pause")}>
              <Pause />
            </button>
          )}
        </nav>
      </header>
      <aside className="mission">
        <div className="eyebrow">
          <span /> 第{levelId}峰 · {level.season}季
          {levelId === 5 ? "终章" : "探索"}{" "}
          <span className="stars">{"★".repeat(level.difficulty)}</span>
        </div>
        <h1>
          {level.season} <em>{level.name}</em>
        </h1>
        <p>{level.subtitle}</p>
        <div className="divider" />
        <div className="goal">
          <Flag size={17} />
          <span>山顶目标</span>
          <b>{level.idiom}</b>
        </div>
        <div className="word-slots" aria-label="收集字块">
          {level.collect.split("").map((word, i) => (
            <span
              key={i}
              className={state?.collected.includes(i) ? "collected" : ""}
            >
              {word}
              {state?.collected.includes(i) && <Check size={9} />}
            </span>
          ))}
        </div>
        <div className="tasks">
          <div>
            <i>
              {state?.collected.length === level.collect.length ? (
                <Check size={11} />
              ) : (
                1
              )}
            </i>
            收集汉字字块{" "}
            <span>
              {state?.collected.length ?? 0} / {level.collect.length}
            </span>
          </div>
          <div>
            <i>{state?.bag ? <Check size={11} /> : 2}</i>
            {state?.bag ? "福袋已打开" : "找齐汉字，让福袋显形"}
          </div>
          <div>
            <i>3</i>登顶校验完整成语
          </div>
          {levelId === 5 && (
            <div>
              <i>{state?.chase.completed ? <Check size={11} /> : 4}</i>
              {state?.chase.completed ? "已甩开幽灵" : "旋涡门内坚持30秒追逐"}
            </div>
          )}
        </div>
        <div className="peace">
          <Wind size={13} />
          {levelId === 1
            ? "认准目标字 · 小心形近字"
            : "踩出山体会坠落 · 已收字块保留"}
        </div>
      </aside>
      <aside className="inventory">
        <div className="inventory-title">
          <span>
            <Backpack size={14} /> 行囊
          </span>
          <small>INVENTORY</small>
        </div>
        <div className={"bag " + (state?.bag ? "found" : "")}>
          <Sparkles size={24} />
          <div>
            <b>{state?.reward || "福袋尚未显形"}</b>
            <small>
              {state?.bag
                ? "前往山顶红旗校验"
                : `寻找 ${level.collect.length} 个汉字字块`}
            </small>
          </div>
        </div>
        <div className="altitude">
          <span>登山进度</span>
          <b>
            {state?.progress ?? 0}
            <small>%</small>
          </b>
        </div>
        <div className="track">
          <i style={{ width: (state?.progress ?? 0) + "%" }} />
        </div>
        <div className="elevation">
          <span>山脚</span>
          <Flag size={11} />
          <span>山顶</span>
        </div>
        {playing && (
          <>
            <div className="resource">
              <span>体力</span>
              <meter min={0} max={100} value={state?.stamina ?? 100} />
              <b>{Math.round(state?.stamina ?? 100)}</b>
            </div>
            <div className="resource energy">
              <span>能量</span>
              <meter min={0} max={100} value={state?.energy ?? 0} />
              <b>{Math.round(state?.energy ?? 0)}</b>
            </div>
            <div className="quick-tools">
              <button
                title="望远镜 F"
                disabled={!state?.telescope}
                onClick={() => game.current?.telescope()}
              >
                <Focus size={15} />
              </button>
              <button
                title="切换武器 1 / 2"
                disabled={!state?.bow && !state?.pistol}
                onClick={() => game.current?.switchWeapon()}
              >
                <Target size={15} />
              </button>
              <button title="重置关卡 R" onClick={() => open("reset")}>
                <RotateCcw size={15} />
              </button>
            </div>
          </>
        )}
      </aside>
      <div className="compass">
        <span>W</span>
        <i />
        <b>N</b>
        <i />
        <span>E</span>
        <div>◆</div>
      </div>
      {mode === "menu" && !loading && !error && !won && (
        <section className="intro">
          <div className="intro-kicker">四季山岳 · 汉字奇旅</div>
          <h2>山行者</h2>
          <div className="intro-tagline">循四季，赴山巅。</div>
          <p>
            五座山峰，等你留下足迹。
            <br />
            把「{level.idiom}」带到山顶红旗。
          </p>
          <div className="intro-buttons">
            <button className="primary" onClick={play}>
              开始攀登 <ArrowUpRight size={20} />
            </button>
            <button className="secondary" onClick={() => open("peaks")}>
              选择山峰 <Map size={15} />
            </button>
          </div>
          <div className="season-route" role="group" aria-label="预览五峰">
            {LEVELS.map((peak) => (
              <button
                key={peak.id}
                data-season={peak.id}
                aria-label={`预览${peak.season}峰：${peak.name}`}
                aria-pressed={levelId === peak.id}
                onClick={() => setLevelId(peak.id)}
              >
                <span>{peak.season === "终" ? "巅" : peak.season}</span>
                <small>{peak.name}</small>
                {save.current.completed.includes(peak.id) && (
                  <Check size={10} />
                )}
              </button>
            ))}
          </div>
          <small>
            <Footprints size={13} /> 已登顶 {save.current.completed.length} / 5
            峰 · 进度保存在本机
          </small>
        </section>
      )}
      {loading && (
        <div className="loading" role="status">
          <Mountain size={34} />
          <p>正在构建{level.season}日山岳…</p>
          <div className="loading-line" />
          <small>准备地形、物理与声景</small>
        </div>
      )}
      {error && (
        <div className="overlay">
          <section className="modal">
            <h2>暂时无法进入山岳</h2>
            <p>请确认浏览器支持 WebGL，并启用硬件加速。</p>
            <small>{error}</small>
            <button className="primary" onClick={() => setRetry((v) => v + 1)}>
              重新加载
            </button>
          </section>
        </div>
      )}
      {playing && state?.dead && (
        <div className="death-notice" role="status">
          <strong>{state.deathReason}</strong>
          <p>
            {/坠|边界/.test(state.deathReason) ? "坠落中" : "倒地"} ·{" "}
            {Math.ceil(state.deathRemaining)} 秒后重新出发
          </p>
          <small>已收集汉字保留</small>
        </div>
      )}
      {playing && state?.climbing && (
        <div className="climb-notice">
          <Hand size={19} />
          <strong>绳索攀爬 {Math.round(state.climbProgress * 100)}%</strong>
          <span>W / 上推攀爬 · S 下滑 · E 松手</span>
        </div>
      )}
      {playing && state?.chase.active && (
        <>
          <section
            className={
              "chase-hud " + (state.chase.turnReady ? "turn-ready" : "")
            }
            aria-live="polite"
          >
            <div className="eyebrow">
              终章 · 幽灵追逐 <span>已完成 {state.chase.turns} 次转弯</span>
            </div>
            <div className="chase-timer">
              {String(
                Math.floor(Math.ceil(state.chase.remaining) / 60),
              ).padStart(2, "0")}
              :{String(Math.ceil(state.chase.remaining) % 60).padStart(2, "0")}
            </div>
            <div className="chase-progress">
              <i
                style={{
                  width: (state.chase.elapsed / CHASE_DURATION) * 100 + "%",
                }}
              />
            </div>
            <h2>
              {state.chase.countdown > 0
                ? "准备奔逃"
                : state.chase.direction
                  ? state.chase.direction === -1
                    ? "← 左急转"
                    : "右急转 →"
                  : "保持奔跑"}
            </h2>
            <p>
              {state.chase.countdown > 0
                ? "自动奔跑 · 转弯 / 跳横木"
                : state.chase.obstacleIn < 0.65
                  ? "现在跳！Space / 跳跃"
                  : state.chase.obstacleIn < 1.4
                    ? "前方横木，准备起跳"
                    : state.chase.direction
                      ? state.chase.turnReady
                        ? "现在转！A / D 或左右滑动"
                        : `${state.chase.turnIn.toFixed(1)} 秒后进入急弯，准备转向`
                      : "坚持到计时结束"}
            </p>
            <div className="chase-stamina">
              <span>
                {state.chase.sprinting ? "冲刺中" : "Shift / 按住加速"}
              </span>
              <meter
                min={0}
                max={100}
                value={state.chase.stamina}
                aria-label="追逐冲刺体力"
              />
            </div>
            <small>
              幽灵距离 {state.chase.gap.toFixed(1)} 米 · 撞横木会失速
            </small>
          </section>
          {state.chase.countdown > 0 && (
            <div className="chase-countdown">
              {Math.ceil(state.chase.countdown)}
            </div>
          )}
          <div className="chase-turn-buttons">
            <Hold
              title="追逐加速奔跑"
              className={
                state.chase.sprinting ? "chase-sprint active" : "chase-sprint"
              }
              onHold={(v) => game.current?.sprint(v)}
            >
              <Wind size={15} /> 加速 <kbd>SHIFT</kbd>
            </Hold>
            <button
              aria-label="追逐左转"
              onClick={() => game.current?.turn(-1)}
              disabled={!state.chase.turnReady}
            >
              ← 左转 <kbd>A</kbd>
            </button>
            <button
              aria-label="追逐右转"
              onClick={() => game.current?.turn(1)}
              disabled={!state.chase.turnReady}
            >
              右转 → <kbd>D</kbd>
            </button>
            <button className="chase-jump" onClick={() => game.current?.jump()}>
              跳跃 <kbd>SPACE</kbd>
            </button>
          </div>
        </>
      )}
      {playing && (
        <>
          <div
            className={"crosshair " + (state?.zoom ? "scoped" : "")}
            aria-hidden="true"
          >
            +
          </div>
          <div className="journey-note" aria-live="polite">
            {state?.message && <div className="toast">✧ {state.message}</div>}
            {state?.prompt ? (
              <button
                onClick={() =>
                  state.inPit ? game.current?.jump() : game.current?.interact()
                }
              >
                <kbd>{state.inPit ? "SPACE" : "E"}</kbd>
                {state.prompt}
                <ChevronRight size={15} />
              </button>
            ) : null}
          </div>
          {state?.inPit && (
            <div className={"pit-meter " + (state.pitReady ? "perfect" : "")}>
              <strong>
                {state.pitReady ? "完美窗口 · 现在跳！" : "坑底蓄力"}
              </strong>
              <div>
                <i
                  style={{
                    width: Math.min(100, (state.charge / 1.25) * 100) + "%",
                  }}
                />
                <span
                  style={{
                    left: ((levelId === 1 ? 0.35 : 0.45) / 1.25) * 100 + "%",
                    width:
                      (((levelId === 4 ? 0.85 : 1.12) -
                        (levelId === 1 ? 0.35 : 0.45)) /
                        1.25) *
                        100 +
                      "%",
                  }}
                />
              </div>
            </div>
          )}
          <div className="weapon-panel">
            <Target size={20} />
            <div>
              <b>
                {state?.weapon === "pistol"
                  ? "机关枪"
                  : state?.bow
                    ? "弓箭"
                    : "徒手探索"}
              </b>
              <small>
                {state?.weapon === "pistol"
                  ? `${state.ammo} 发弹药`
                  : state?.bow
                    ? "∞ 无限箭矢"
                    : "在山脚拾取武器"}
              </small>
            </div>
            <button
              onClick={() => game.current?.switchWeapon()}
              aria-label="切换武器"
            >
              1 / 2
            </button>
          </div>
          <button
            className="ultimate-desktop"
            onClick={() => game.current?.burst()}
            disabled={(state?.energy ?? 0) < 100 || (state?.cooldown ?? 0) > 0}
          >
            <Flame size={17} />
            <span>
              冲击波 <kbd>Q</kbd>
            </span>
            <small>
              {(state?.cooldown ?? 0) > 0
                ? `${Math.ceil(state!.cooldown)}s`
                : `${Math.round(state?.energy ?? 0)}%`}
            </small>
          </button>
          <div className="buffs">
            {Object.entries(state?.buffs ?? {}).map(([name, time]) => (
              <span key={name}>
                {name} {Math.ceil(time)}s
              </span>
            ))}
            {state?.fireOut && <span>水渠已引流</span>}
            {(state?.guardians.length ?? 0) > 0 && (
              <span>守护石碑 {state?.guardians.length}/3</span>
            )}
          </div>
          {levelId === 5 && !state?.chase.active && state?.bossHp !== 0 && (
            <div className="boss">
              <div>
                终焉恶龙{" "}
                <span>
                  阶段 {state?.phase} · {state?.bossHp}/{state?.bossMax}
                </span>
              </div>
              <div>
                <i
                  style={{
                    width:
                      ((state?.bossHp ?? 0) / (state?.bossMax || 1)) * 100 +
                      "%",
                  }}
                />
              </div>
              <small>
                {state?.phase === 1
                  ? "雷霆蓄力：留意龙口蓝光，横移躲避"
                  : state?.phase === 2
                    ? "龙息喷射：留意龙口橙光，避开火焰"
                    : "雷霆与召唤：避开电弧，清理虫群"}
              </small>
            </div>
          )}
          <div
            className={
              "touch joystick-" +
              settings.joystick +
              (settings.sprintSwap ? " swap" : "")
            }
          >
            <div
              className="joystick"
              role="application"
              aria-label="移动摇杆"
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                joy(e);
              }}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) joy(e);
              }}
              onPointerUp={endJoy}
              onPointerCancel={endJoy}
              onLostPointerCapture={endJoy}
            >
              <Compass />
              <div
                style={{
                  transform: `translate(${stick.x * 32}px,${stick.y * 32}px)`,
                }}
              />
            </div>
            <div className="touch-actions">
              <Hold
                title="按住冲刺"
                className="sprint-action"
                onHold={(v) => game.current?.sprint(v)}
              >
                <Wind />
                冲刺
              </Hold>
              <Hold
                title="按住射击"
                className="shoot-action"
                onHold={(v) => game.current?.shoot(v)}
              >
                <Target />
                射击
              </Hold>
              <button
                className="jump-action"
                onClick={() => game.current?.jump()}
              >
                <MoveUp />
                跳跃
              </button>
              <button
                className="interact-action"
                onClick={() => game.current?.interact()}
              >
                <Hand />
                交互
              </button>
              <button
                className="burst-action"
                disabled={
                  (state?.energy ?? 0) < 100 || (state?.cooldown ?? 0) > 0
                }
                onClick={() => game.current?.burst()}
              >
                <Flame />爆
                <small>
                  {state?.cooldown
                    ? Math.ceil(state.cooldown) + "s"
                    : Math.round(state?.energy ?? 0) + "%"}
                </small>
              </button>
            </div>
          </div>
        </>
      )}
      <footer>
        <div
          className="sound-note"
          data-playing={state?.soundtrack.playing ?? false}
        >
          <span className="sound-bars" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <i key={i} style={{ "--bar": i } as React.CSSProperties} />
            ))}
          </span>
          <div>
            {MUSIC_TITLES[state?.soundtrack.key ?? ""] ?? level.music}
            <small>
              {settings.muted
                ? "已静音"
                : state?.soundtrack.playing
                  ? "场景配乐 · 正在播放"
                  : mode === "menu"
                    ? "场景配乐 · 出发后奏响"
                    : playing
                      ? "山间声景"
                      : "配乐已暂停"}
            </small>
          </div>
        </div>
        <div className="keyboard">
          <span>
            <kbd>WASD</kbd> 移动
          </span>
          <span>
            <kbd>SPACE</kbd> 跳跃
          </span>
          <span>
            <kbd>SHIFT</kbd> 冲刺
          </span>
          <span>
            <kbd>E</kbd> 交互
          </span>
          <span>点击移动 / 点怪射击 · 拖动环顾</span>
        </div>
        <button className="help" onClick={() => open("help")}>
          操作指南 <span>?</span>
        </button>
      </footer>
      {storageError && (
        <div className="storage-warning" role="status">
          浏览器未允许本地存储，本次进度仍可继续游玩。
        </div>
      )}
      {modal && !error && (
        <div className="overlay">
          <section
            className={
              "modal " +
              (won ? "victory-modal" : mode === "peaks" ? "peaks-modal" : "")
            }
            role="dialog"
            aria-modal="true"
            aria-label={
              won
                ? "登顶成功"
                : mode === "settings"
                  ? "旅途设置"
                  : mode === "peaks"
                    ? "选择山峰"
                    : "旅途面板"
            }
          >
            {!won && (
              <button className="close" title="关闭" onClick={close}>
                <X size={18} />
              </button>
            )}
            {won ? (
              <>
                <div className="confetti" aria-hidden="true">
                  {Array.from({ length: 28 }, (_, i) => (
                    <i key={i} style={{ "--i": i } as React.CSSProperties} />
                  ))}
                </div>
                <div className="medal">
                  <Trophy size={48} />
                </div>
                <div className="eyebrow">
                  SUMMIT CONQUERED · 第 {levelId} 峰
                </div>
                <h2>你做到了！</h2>
                <div className="victory-title">
                  {levelId === 5
                    ? "五峰征服者 · 登峰造极"
                    : `${level.season}峰已征服 · ${level.name}勋章`}
                </div>
                <p className="victory-message">
                  {(state?.deaths ?? 0) > 0
                    ? "每次重新出发，都让你更强。今天，你站上了山顶！"
                    : "从第一步到最高处，这座山见证了你的实力。"}
                </p>
                <div className="victory-stats">
                  <div>
                    <b>
                      {state?.collected.length}
                      <small> / {level.collect.length}</small>
                    </b>
                    <span>汉字集齐</span>
                  </div>
                  <div>
                    <b>
                      {Math.floor((state?.time ?? 0) / 60)}
                      <small> 分 </small>
                      {Math.floor((state?.time ?? 0) % 60)}
                      <small> 秒</small>
                    </b>
                    <span>登顶用时</span>
                  </div>
                  <div>
                    <b>
                      {save.current.completed.length}
                      <small> / 5</small>
                    </b>
                    <span>征服山峰</span>
                  </div>
                </div>
                <div className="victory-peaks" aria-label="五峰成就">
                  {LEVELS.map((l) => (
                    <span
                      key={l.id}
                      className={
                        save.current.completed.includes(l.id) ? "achieved" : ""
                      }
                    >
                      <Mountain size={22} />
                      {l.season}
                    </span>
                  ))}
                </div>
                {levelId < 5 ? (
                  <button
                    className="primary"
                    onClick={() => {
                      choose(levelId + 1);
                    }}
                  >
                    前往下一峰 · {LEVELS[levelId].name}
                    <ChevronRight size={18} />
                  </button>
                ) : (
                  <button
                    className="primary"
                    onClick={() => {
                      game.current?.reset();
                      setMode("peaks");
                    }}
                  >
                    回望五座山峰 <Map size={18} />
                  </button>
                )}
                <button
                  className="secondary"
                  onClick={() => {
                    game.current?.reset();
                    setMode("play");
                  }}
                >
                  重游本峰（保留字块） <RotateCcw size={15} />
                </button>
              </>
            ) : mode === "settings" ? (
              <>
                <div className="eyebrow">调整你的登山方式</div>
                <h2>旅途设置</h2>
                <div className="setting-list">
                  <label>
                    音乐与音效
                    <button
                      className="pill"
                      aria-pressed={!settings.muted}
                      onClick={() => update("muted", !settings.muted)}
                    >
                      {settings.muted ? "已关闭" : "已开启"}
                    </button>
                  </label>
                  <label>
                    固定视角
                    <button
                      className="pill"
                      aria-pressed={settings.fixedCamera}
                      onClick={() =>
                        update("fixedCamera", !settings.fixedCamera)
                      }
                    >
                      {settings.fixedCamera ? "开启" : "关闭"}
                    </button>
                  </label>
                  <label>
                    镜头灵敏度
                    <input
                      aria-label="镜头灵敏度"
                      type="range"
                      min=".3"
                      max="2.5"
                      step=".1"
                      value={settings.sensitivity}
                      onChange={(e) =>
                        update("sensitivity", Number(e.target.value))
                      }
                    />
                  </label>
                  <label>
                    摇杆位置
                    <select
                      aria-label="摇杆位置"
                      value={settings.joystick}
                      onChange={(e) =>
                        update("joystick", e.target.value as "left" | "bottom")
                      }
                    >
                      <option value="bottom">左下角</option>
                      <option value="left">左侧</option>
                    </select>
                  </label>
                  <label>
                    控件透明度
                    <input
                      aria-label="控件透明度"
                      type="range"
                      min=".3"
                      max="1"
                      step=".05"
                      value={settings.opacity}
                      onChange={(e) =>
                        update("opacity", Number(e.target.value))
                      }
                    />
                  </label>
                  <label>
                    按钮大小
                    <input
                      aria-label="按钮大小"
                      type="range"
                      min=".7"
                      max="1.4"
                      step=".05"
                      value={settings.buttonScale}
                      onChange={(e) =>
                        update("buttonScale", Number(e.target.value))
                      }
                    />
                  </label>
                  <label>
                    交换冲刺 / 交互位置
                    <button
                      className="pill"
                      aria-pressed={settings.sprintSwap}
                      onClick={() => update("sprintSwap", !settings.sprintSwap)}
                    >
                      {settings.sprintSwap ? "已交换" : "默认"}
                    </button>
                  </label>
                  <label>
                    震动反馈
                    <button
                      className="pill"
                      aria-pressed={settings.vibration}
                      onClick={() => update("vibration", !settings.vibration)}
                    >
                      {settings.vibration ? "开启" : "关闭"}
                    </button>
                  </label>
                </div>
                <small>设置自动保存在此浏览器；震动依设备支持。</small>
                <button className="primary" onClick={close}>
                  保存并返回 <Check size={17} />
                </button>
              </>
            ) : mode === "peaks" ? (
              <>
                <div className="eyebrow">四季之旅 · 自由选择挑战</div>
                <h2>山有五峰，各有一程</h2>
                <div className="level-list">
                  {LEVELS.map((l) => (
                    <button
                      key={l.id}
                      className={l.id === levelId ? "selected" : ""}
                      onClick={() => choose(l.id)}
                    >
                      <span className="level-number">0{l.id}</span>
                      <div>
                        <b>
                          {l.season} · {l.name}
                        </b>
                        <small>
                          {l.idiom} <span>{"★".repeat(l.difficulty)}</span>
                        </small>
                      </div>
                      {save.current.completed.includes(l.id) ? (
                        <Check size={19} />
                      ) : (
                        <ChevronRight size={18} />
                      )}
                    </button>
                  ))}
                </div>
                <p>
                  已收集汉字跨失败保留；每峰能量独立。
                  <br />
                  建议依次挑战，掌握蹬坑后再进入秋、冬峰。
                </p>
              </>
            ) : mode === "reset" ? (
              <>
                <div className="eyebrow">重新整理行囊</div>
                <h2>要从山脚重新出发吗？</h2>
                <p>
                  本关怪物、炸弹、机关、武器与福袋重置。
                  <br />
                  已收集汉字会保留。
                </p>
                <button
                  className="primary"
                  onClick={() => {
                    game.current?.reset();
                    setMode("play");
                  }}
                >
                  保留字块，重新出发 <RotateCcw size={17} />
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    game.current?.reset(true);
                    setMode("play");
                  }}
                >
                  连同本峰字块一起重置
                </button>
                <button className="secondary" onClick={close}>
                  取消
                </button>
              </>
            ) : mode === "pause" ? (
              <>
                <div className="eyebrow">山风稍歇</div>
                <h2>休息一下，再向上</h2>
                <p>游戏已暂停，体力、机关和怪物时间均已停止。</p>
                <button className="primary" onClick={() => setMode("play")}>
                  继续攀登 <Play size={17} />
                </button>
                <button className="secondary" onClick={() => setMode("menu")}>
                  返回主菜单 <ArrowLeft size={16} />
                </button>
              </>
            ) : (
              <>
                <div className="eyebrow">掌握借势，才有向上的力量</div>
                <h2>登山手册</h2>
                <div className="guide">
                  <p>
                    <b>移动与战斗</b>
                    <br />
                    WASD 移动 · 空格向前跳跃 · 左 Shift 冲刺
                    <br />
                    点击道路移动 · 点击怪物或按住鼠标 / J 射击 · 拖动环顾
                    <br />E 交互 · 1 / 2 武器 · F 望远镜 · Q 冲击波
                    <br />R 确认重开 · Esc 暂停
                  </p>
                  <p>
                    <b>凹坑蹬跳</b>
                    <br />
                    站进圆形浅坑，停止前进蓄力。光环变金时单按 Space /
                    跳跃，自动借势落上对应高台，不需要同时按
                    W。过早只有小跳，过晚会滑落；冰坑窗口更短。第 3
                    关起首段为交错升降刀阵，碰到即死，等刀升起再通过；后续橙黑减速带会反推并消耗体力，可跳过或借坑弹射。
                  </p>
                  <p>
                    <b>字块与生存</b>
                    <br />
                    收齐所有汉字后福袋才显形。碰到福袋即自动打开，随机获得彩虹、撒花、香槟或元宝。走到山顶红旗附近即自动校验，
                    成功后弹出登顶标识。踩出山体、触碰炸弹、被野兽击中都会失败；死亡先在道路上倒地停留3秒，再重生。已收字块保留；重生后所有怪物恢复满血与初始位置，机关重置。走近武器自动拾取；补给每
                    15 秒刷新。
                  </p>
                  <p>
                    <b>移动端与终章</b>
                    <br />
                    左摇杆移动，右侧空白滑动环顾。射击和冲刺支持按住；大招满能量才可释放。终章先在水渠引水灭火，再攀绳取悬崖字块。陡坡按
                    E 抓绳，再按 W /
                    上推攀爬。第5关走入黑色旋涡门后进入独立场地，必须完成30秒追逐：A/D、屏幕左右点击或滑动急转，空格跳横木；按住
                    Shift
                    或“加速”消耗体力奔跑，甩开持恶鬼叉的黑色幽灵。胜利后自动获得机关枪、48发弹药和无限弓箭，返回山路挑战恶龙。三块守护石碑可削弱三阶段
                    BOSS。
                  </p>
                </div>
                <button className="primary" onClick={close}>
                  明白了 <ChevronRight size={18} />
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
