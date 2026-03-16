import "dotenv/config";
import { runBenchmarkUpdate } from "../lib/benchmarks/updater/graph";

async function main() {
    console.log("Starting benchmark update pipeline...");
    const result = await runBenchmarkUpdate();
    console.log(`Pipeline complete. Upserted ${result.upsertedCount} rates.`);
    if (result.errors?.length > 0) {
        console.error("Errors encountered:", result.errors);
        process.exit(1);
    }
    process.exit(0);
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
