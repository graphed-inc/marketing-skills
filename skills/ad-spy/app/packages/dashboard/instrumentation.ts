export async function register(): Promise<void> {
  // Next compiles this file for the edge runtime too. The bundler drops the Node
  // import only when it can see `process.env.NEXT_RUNTIME` here. Reading it
  // through envSlice() keeps the import and the build fails resolving `fs`.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { boot } = await import("./boot");
    await boot();
  }
}
