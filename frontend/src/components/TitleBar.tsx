import { useEffect, useState } from "react";

const isDesktop = typeof window !== "undefined" && Boolean(window.desktopApp?.isDesktop);

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isDesktop || !window.electronAPI?.onWindowState) {
      return;
    }
    const unsubscribe = window.electronAPI.onWindowState((payload) => {
      setIsMaximized(Boolean(payload?.isMaximized));
    });
    return unsubscribe;
  }, []);

  if (!isDesktop) {
    return null;
  }

  return (
    <header className="desktop-titlebar" aria-label="Окно приложения">
      <div
        className="desktop-titlebar__drag"
        onDoubleClick={() => window.electronAPI?.maximizeWindow?.()}
        title="Двойной клик: развернуть / восстановить"
      >
        <img
          src="/logo.png"
          alt="Forma"
          className="desktop-titlebar__icon"
          draggable={false}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
      <div className="desktop-titlebar__controls" aria-label="Управление окном">
        <button
          type="button"
          className="desktop-titlebar__button"
          onClick={() => window.electronAPI?.minimizeWindow?.()}
          aria-label="Свернуть окно"
          title="Свернуть"
        >
          -
        </button>
        <button
          type="button"
          className="desktop-titlebar__button"
          onClick={() => window.electronAPI?.maximizeWindow?.()}
          aria-label="Развернуть или восстановить окно"
          title={isMaximized ? "Восстановить" : "Развернуть"}
        >
          {isMaximized ? "❐" : "□"}
        </button>
        <button
          type="button"
          className="desktop-titlebar__button desktop-titlebar__button--close"
          onClick={() => window.electronAPI?.closeWindow?.()}
          aria-label="Закрыть окно"
          title="Закрыть"
        >
          ×
        </button>
      </div>
    </header>
  );
}
