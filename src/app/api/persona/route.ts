import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || '',
});

const dataPath = path.join(process.cwd(), 'src/data/library.json');

async function readLibrary(): Promise<any[]> {
    try {
        const data = await fs.readFile(dataPath, 'utf8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

async function writeLibrary(library: any[]) {
    await fs.writeFile(dataPath, JSON.stringify(library, null, 2));
}

export async function GET() {
    const library = await readLibrary();
    return NextResponse.json(library);
}

export async function POST(req: NextRequest) {
    try {
        const { rawTitle, department, seniority } = await req.json();

        const embedding = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: rawTitle,
        });

        const vector = Array.from(embedding.data[0].embedding);

        const library = await readLibrary();
        const newId = library.length > 0 ? Math.max(...library.map((p: any) => p.id)) + 1 : 1;
        const newPersona = { id: newId, rawTitle, department, seniority, vector };

        library.push(newPersona);
        await writeLibrary(library);

        return NextResponse.json(newPersona);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to add persona' }, { status: 500 });
    }
}
