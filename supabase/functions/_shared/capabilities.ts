export interface DetectedStack {
    supabase: boolean;
    firebase: boolean;
    prisma: boolean;
    drizzle: boolean;
    neon: boolean;
    graphql: boolean;
    hasDockerfile: boolean;
    planetscale: boolean;
    convex: boolean;
    hasura: boolean;
    cockroachdb: boolean;
}

export function detectCapabilities(files: { path: string }[]): DetectedStack {
    const stack: DetectedStack = {
        supabase: false,
        firebase: false,
        prisma: false,
        drizzle: false,
        neon: false,
        graphql: false,
        hasDockerfile: false,
        planetscale: false,
        convex: false,
        hasura: false,
        cockroachdb: false,
    };

    for (const file of files) {
        const path = file.path.toLowerCase();

        // Supabase
        if (path.includes('supabase/config.toml') ||
            path.includes('supabase/functions') ||
            path.includes('.supabase')) {
            stack.supabase = true;
        }

        // Firebase
        if (path.includes('firebase.json') ||
            path.includes('.firebaserc')) {
            stack.firebase = true;
        }

        // Prisma
        if (path.includes('schema.prisma') ||
            path.includes('prisma/schema.prisma')) {
            stack.prisma = true;
        }

        // Drizzle
        if (path.includes('drizzle.config.ts') ||
            path.includes('drizzle.config.js')) {
            stack.drizzle = true;
        }

        // Neon (harder to detect purely by file presence, usually env vars or specific connection strings, 
        // but sometimes people put neon configs in code. We'll stick to basic inference or maybe package.json dependency (not available here usually))
        // For now, let's leave Neon as false unless we scan content, which we don't do in this shallow pass.

        // GraphQL
        if (path.endsWith('.graphql') ||
            path.endsWith('.gql') ||
            path.includes('codegen.yml')) {
            stack.graphql = true;
        }

        // Docker
        if (path.endsWith('dockerfile') ||
            path.includes('docker-compose.yml')) {
            stack.hasDockerfile = true;
        }

        // PlanetScale
        if (path.includes('.pscale.yml') ||
            path.includes('planetscale.yaml')) {
            stack.planetscale = true;
        }

        // Convex
        if (path.includes('convex.json') ||
            path.includes('convex/')) {
            stack.convex = true;
        }

        // Hasura
        if (path.includes('hasura/config.yaml') ||
            path.includes('hasura/metadata') ||
            path.includes('hasura.config.js')) {
            stack.hasura = true;
        }

        // CockroachDB (often just looks like Postgres, but sometimes specific migrations)
        // Hard to detect without content, but let's look for known patterns if any
        // Leaving as false default for now unless file name is obvious
    }

    return stack;
}
