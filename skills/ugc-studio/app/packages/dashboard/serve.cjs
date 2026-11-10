const { randomUUID } = require("node:crypto");

// Next's standalone server binds process.env.HOSTNAME. A container sets that
// to the pod name, which is the pod address and not 127.0.0.1. The word fixer
// calls back to this process on loopback, so listen on every interface.
process.env.HOSTNAME = "0.0.0.0";
// One shared secret. The worker bundle and the route bundle would otherwise
// each invent their own, and the word check would be refused.
if (!process.env.UGC_TX_TOKEN) process.env.UGC_TX_TOKEN = randomUUID();
require("./.next/standalone/packages/dashboard/server.js");
