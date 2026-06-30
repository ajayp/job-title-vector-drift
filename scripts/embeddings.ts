import OpenAI from 'openai';
import fs from 'fs/promises';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const cfgPath = new URL('../cfg/titles.json', import.meta.url);
const dataPath = new URL('../src/data/library.json', import.meta.url);

interface TitleConfig {
    rawTitle: string;
    department: string;
    seniority: number;
}

interface JobTitle extends TitleConfig {
    vector: number[];
}

async function seed() {
    console.log('🚀 Starting sequential seeding process...');
    try {
        // Read cfg as source of truth
        let config: TitleConfig[];
        try {
            config = JSON.parse(await fs.readFile(cfgPath, 'utf8'));
        } catch (err: unknown) {
            if (err && typeof err === 'object' && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
                console.error('❌ cfg/titles.json not found.');
                process.exit(1);
            }
            throw err;
        }

        // Load existing library to carry over cached vectors (smart upsert)
        let existing: JobTitle[] = [];
        try {
            existing = JSON.parse(await fs.readFile(dataPath, 'utf8'));
        } catch {
            // library.json may not exist yet — that's fine, start fresh
        }

        const vectorCache = new Map(existing.map(e => [e.rawTitle, e.vector]));

        // Rebuild library from cfg, reusing cached vectors where available
        const library: JobTitle[] = config.map(entry => ({
            ...entry,
            vector: vectorCache.get(entry.rawTitle) ?? [],
        }));

        // Find titles that still need embedding
        const toSeed = library.filter(p => !p.vector || p.vector.length === 0);

        if (toSeed.length === 0) {
            await fs.writeFile(dataPath, JSON.stringify(library, null, 2));
            console.log('✅ All job titles already have embeddings. library.json rebuilt from cfg.');
            return;
        }

        console.log(`Found ${toSeed.length} title(s) with empty vectors to seed.`);

        for (const title of toSeed) {
            console.log(`📡 Fetching embedding for: ${title.rawTitle}`);
            const embedding = await openai.embeddings.create({
                model: 'text-embedding-3-small',
                input: title.rawTitle,
            });

            title.vector = Array.from(embedding.data[0].embedding);
        }

        await fs.writeFile(dataPath, JSON.stringify(library, null, 2));
        console.log(`✅ Success! Seeded ${toSeed.length} title(s). library.json rebuilt from cfg.`);
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
}

async function clearVectors() {
    console.log('🗑️ Clearing all vectors from library.json...');
    try {
        const libraryData = await fs.readFile(dataPath, 'utf8').then(JSON.parse).catch(() => ([]));
        const library: JobTitle[] = libraryData;

        let clearedCount = 0;
        for (const persona of library) {
            if (persona.vector && persona.vector.length > 0) {
                persona.vector = [];
                clearedCount++;
            }
        }

        await fs.writeFile(dataPath, JSON.stringify(library, null, 2));
        console.log(`✅ Cleared ${clearedCount} vector(s) from library.json`);
    } catch (error) {
        console.error('❌ Clear failed:', error);
        process.exit(1);
    }
}

// Handle command-line arguments
const command = process.argv[2];

if (command === 'clear') {
    clearVectors();
} else if (command === 'seed' || !command) {
    seed();
} else {
    console.log('Usage: npx ts-node scripts/seed.ts [seed|clear]');
    console.log('  seed  - Rebuild library.json from cfg/titles.json, embed any new titles (default)');
    console.log('  clear - Remove all vector data from library.json');
    process.exit(1);
}
