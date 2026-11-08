/** 与触屏布局一致，也覆盖未正确报告 coarse pointer 的手机浏览器。 */
export const MOBILE_QUERY = "(pointer: coarse), (max-width: 800px)";
export const MOBILE_PORTRAIT_QUERY =
  "(pointer: coarse) and (orientation: portrait), (max-width: 800px) and (orientation: portrait)";

/** 横屏锁定需要用户手势，且多数浏览器要求先进入全屏；不支持时交给旋转提示。 */
export async function enterLandscape() {
  try {
    if (!document.fullscreenElement)
      await document.documentElement.requestFullscreen?.();
  } catch {
    // Safari 等环境可能禁止全屏，但仍可尝试设备提供的方向 API。
  }
  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: "landscape") => Promise<void>;
    };
    await orientation?.lock?.("landscape");
  } catch {
    // 用户可手动旋转，游戏界面会随视口方向恢复。
  }
}

/** 全屏入口共用横屏逻辑，所有拒绝均在本层处理，避免未捕获的 Promise。 */
export async function toggleFullscreen() {
  if (document.fullscreenElement) {
    try {
      await document.exitFullscreen();
    } catch {
      /* 浏览器可能已经退出全屏。 */
    }
  } else await enterLandscape();
}
