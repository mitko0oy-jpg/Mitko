import { me, topbar } from "./app.js";

me().then((m) => topbar(m)).catch(() => {});
