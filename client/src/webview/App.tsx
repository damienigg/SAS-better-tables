// Copyright © 2026 Damien Iggiotti
// SPDX-License-Identifier: Apache-2.0

import { useEffect } from "react";

import { send, onHostMessage } from "./messaging";
import { bindPump, resetPump } from "./pump";
import { useStore } from "./store";
import { Toolbar } from "./Toolbar";
import { StatusBar } from "./StatusBar";
import { Grid } from "./grid/Grid";
import { CellDetail } from "./CellDetail";

export function App() {
  const init = useStore((s) => s.init);
  const setError = useStore((s) => s.setError);

  useEffect(() => {
    const offPump = bindPump();
    const offMsg = onHostMessage((msg) => {
      switch (msg.kind) {
        case "init":
          resetPump();
          init({
            title: msg.title,
            columns: msg.columns,
            rowCount: msg.rowCount,
            pageSize: msg.pageSize,
            sort: msg.viewState?.sort,
            filters: msg.viewState?.filters,
          });
          break;
        case "error":
          setError(msg.message);
          break;
        default:
          // rows-resp / theme handled inside their own modules.
          break;
      }
    });
    send({ kind: "ready" });
    return () => {
      offPump();
      offMsg();
    };
  }, [init, setError]);

  return (
    <div className="btv-root">
      <Toolbar />
      <Grid />
      <StatusBar />
      <CellDetail />
    </div>
  );
}
