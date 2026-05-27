import OpenAI from 'openai';
import fs from 'fs/promises';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const dataPath = new URL('../src/data/library.json', import.meta.url);

interface JobTitle {
    id: number;
    rawTitle: string;
    department: string;
    seniority: number;
    vector: number[];
}

async function seed() {
    console.log('🚀 Starting sequential seeding process...');
    try {
        const libraryData = await fs.readFile(dataPath, 'utf8').then(JSON.parse).catch(() => ([]));
        const library: JobTitle[] = libraryData;

        // Find titles with empty vectors
        const toSeed = library.filter(p => !p.vector || p.vector.length === 0);

        if (toSeed.length === 0) {
            console.log('✅ All job titles already have embeddings. Nothing to seed.');
            return;
        }

        console.log(`Found ${toSeed.length} title(s) with empty vectors to seed.`);

        for (const title of toSeed) {
            console.log(`📡 Fetching embedding for: ${title.rawTitle}`);
            const embedding = await openai.embeddings.create({
                model: 'text-embedding-3-small',
                input: title.rawTitle,
            });

            const vector = Array.from(embedding.data[0].embedding);
            title.vector = vector;
        }

        await fs.writeFile(dataPath, JSON.stringify(library, null, 2));
        console.log(`✅ Success! Seeded ${toSeed.length} title(s) with embeddings.`);
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
    console.log('  seed  - Generate embeddings for job titles with empty vectors (default)');
    console.log('  clear - Remove all vector data from library.json');
    process.exit(1);
}
