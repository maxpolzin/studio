// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

// Allow console logs in this file
/* eslint-disable no-restricted-syntax */

import "colors";
import { init as initSentry } from "@sentry/electron";
import {
  app,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  Menu,
  MenuItemConstructorOptions,
  session,
  shell,
  systemPreferences,
} from "electron";
import installExtension, {
  REACT_DEVELOPER_TOOLS,
  REDUX_DEVTOOLS,
} from "electron-devtools-installer";
import path from "path";

import colors from "@foxglove-studio/app/styles/colors.module.scss";

if (process.env.SENTRY_DSN) {
  initSentry({ dsn: process.env.SENTRY_DSN });
}

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
  app.quit();
}

const isMac = process.platform === "darwin";
const isProduction = process.env.NODE_ENV === "production";

async function createWindow(): Promise<void> {
  const preloadPath = path.join(app.getAppPath(), "main", "preload.js");
  const rendererPath = MAIN_WINDOW_WEBPACK_ENTRY;

  const windowOptions: BrowserWindowConstructorOptions = {
    height: 800,
    width: 1200,
    title: APP_NAME,
    webPreferences: {
      contextIsolation: true,
      preload: preloadPath,
    },
    backgroundColor: colors.background,
  };
  if (isMac) {
    windowOptions.titleBarStyle = "hiddenInset";
  }
  const mainWindow = new BrowserWindow(windowOptions);

  const appMenuTemplate: MenuItemConstructorOptions[] = [];

  if (isMac) {
    appMenuTemplate.push({
      role: "appMenu",
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }

  appMenuTemplate.push({
    role: "fileMenu",
    label: "File",
    submenu: [
      {
        label: "Open Bag",
        click: async () => {
          // <input> elements can only be opened on user interaction
          // We fake a uesr interaction which allows us to invoke input.click() in renderer thread
          // This is a trick which allows us to then handle file opening completely in the browser
          // logic rather than via IPC interfaces.
          mainWindow.focus();
          mainWindow.webContents.sendInputEvent({
            type: "mouseDown",
            x: -1,
            y: -1,
          });
          mainWindow.webContents.sendInputEvent({
            type: "mouseUp",
            x: -1,
            y: -1,
          });
          setTimeout(() => {
            mainWindow.webContents.send("menu.file.open-bag");
          }, 10);
        },
      },
      {
        label: "Open Websocket Url",
        click: async () => {
          mainWindow.webContents.send("menu.file.open-websocket-url");
        },
      },
      isMac ? { role: "close" } : { role: "quit" },
    ],
  });

  appMenuTemplate.push({
    role: "editMenu",
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      ...(isMac
        ? [
            { role: "pasteAndMatchStyle" } as const,
            { role: "delete" } as const,
            { role: "selectAll" } as const,
          ]
        : [
            { role: "delete" } as const,
            { type: "separator" } as const,
            { role: "selectAll" } as const,
          ]),
    ],
  });

  appMenuTemplate.push({
    role: "viewMenu",
    label: "View",
    submenu: [
      { role: "reload" },
      { role: "forceReload" },
      { role: "toggleDevTools" },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  });

  appMenuTemplate.push({
    role: "help",
    submenu: [
      {
        label: "Learn More",
        click: async () => {
          await shell.openExternal("https://electronjs.org");
        },
      },
    ],
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(appMenuTemplate));

  mainWindow.loadURL(rendererPath);

  if (!isProduction) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.webContents.on("ipc-message", (event: Event, channel: string) => {
    if (channel === "window.toolbar-double-clicked") {
      const action: string =
        systemPreferences.getUserDefault("AppleActionOnDoubleClick", "string") || "Maximize";
      if (action === "Minimize") {
        mainWindow.minimize();
      } else if (action === "Maximize") {
        mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
      } else {
        // "None"
      }
    }
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", async () => {
  if (!isProduction) {
    console.group("Installing Chrome extensions for development...");
    // Extension installation sometimes gets stuck between the download step and the extension loading step, for unknown reasons.
    // So don't wait indefinitely for installation to complete.
    let finished = false;
    await Promise.race([
      Promise.allSettled([
        installExtension(REACT_DEVELOPER_TOOLS),
        installExtension(REDUX_DEVTOOLS),
      ]).then((results) => {
        finished = true;
        console.log("Finished:", results);
      }),
      new Promise<void>((resolve) => {
        setTimeout(() => {
          if (!finished) {
            console.warn(
              "Warning: extension installation may be stuck; try relaunching electron or deleting its extensions directory. Continuing for now."
                .yellow,
            );
          }
          resolve();
        }, 5000);
      }),
    ]);
    console.groupEnd();

    // In development, we run with the pre-packaged Electron binary, so we need to manually set the Dock icon.
    try {
      // This fails when opening the app from a packaged DMG.
      app.dock.setIcon("resources/icon/icon.png");
    } catch (error) {
      console.error("Unable to set icon", error);
    }
  }

  // Content Security Policy
  // See: https://www.electronjs.org/docs/tutorial/security
  const contentSecurtiyPolicy: Record<string, string> = {
    "default-src": "'self'",
    "script-src": `'self' 'unsafe-inline'`,
    "style-src": "'self' 'unsafe-inline'",
    "connect-src": "'self' data: ws: wss:", // Required for rosbridge connections
    "font-src": "'self' data:",
  };
  if (!isProduction) {
    // 'unsafe-eval' appears to be required for Chrome developer tools
    contentSecurtiyPolicy["script-src"] += " 'unsafe-eval'";
  }

  // Set default http headers
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          Object.entries(contentSecurtiyPolicy)
            .map(([key, val]) => `${key} ${val}`)
            .join("; "),
        ],
      },
    });
  });

  // Create the main window
  createWindow();

  // This event handler must be added after the "ready" event fires
  // (see https://github.com/electron/electron-quick-start/pull/382)
  app.on("activate", () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
