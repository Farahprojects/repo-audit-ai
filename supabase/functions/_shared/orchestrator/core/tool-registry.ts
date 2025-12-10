/**
 * Tool Registry
 * 
 * Central registry for all tools available to the orchestrator.
 * Tools are registered dynamically and can be queried by the LLM.
 */

import {
    Tool,
    ToolDescription,
    ToolResult,
    ToolContext,
    PermissionLevel
} from './types.ts';

export class ToolRegistry {
    private tools: Map<string, Tool> = new Map();

    /**
     * Register a new tool with the orchestrator
     */
    register(tool: Tool): void {
        if (this.tools.has(tool.name)) {
            console.warn(`[ToolRegistry] Overwriting existing tool: ${tool.name}`);
        }
        this.tools.set(tool.name, tool);
        console.log(`[ToolRegistry] Registered tool: ${tool.name}`);
    }

    /**
     * Register multiple tools at once
     */
    registerMany(tools: Tool[]): void {
        tools.forEach(tool => this.register(tool));
    }

    /**
     * Get a tool by name
     */
    get(name: string): Tool | undefined {
        return this.tools.get(name);
    }

    /**
     * Check if a tool exists
     */
    has(name: string): boolean {
        return this.tools.has(name);
    }

    /**
     * Get all tool descriptions for LLM context
     * Optionally filter by permission level the user has
     */
    getToolList(userPermissions?: PermissionLevel[]): ToolDescription[] {
        const descriptions: ToolDescription[] = [];

        for (const tool of this.tools.values()) {
            // If no permissions filter, include all tools
            if (!userPermissions) {
                descriptions.push({
                    name: tool.name,
                    description: tool.description,
                    inputSchema: tool.inputSchema,
                    requiredPermission: tool.requiredPermission
                });
                continue;
            }

            // Check if user has required permission
            if (this.hasPermission(userPermissions, tool.requiredPermission)) {
                descriptions.push({
                    name: tool.name,
                    description: tool.description,
                    inputSchema: tool.inputSchema,
                    requiredPermission: tool.requiredPermission
                });
            }
        }

        return descriptions;
    }

    /**
     * Execute a tool by name
     */
    async execute(
        name: string,
        input: unknown,
        context: ToolContext
    ): Promise<ToolResult> {
        const tool = this.tools.get(name);

        if (!tool) {
            return {
                success: false,
                error: `Tool not found: ${name}`,
                metadata: { availableTools: Array.from(this.tools.keys()) }
            };
        }

        // Check permissions
        if (!this.hasPermission(context.permissions, tool.requiredPermission)) {
            return {
                success: false,
                error: `Insufficient permissions for tool: ${name}. Required: ${tool.requiredPermission}`,
                metadata: { userPermissions: context.permissions }
            };
        }

        // Execute the tool
        try {
            const startTime = Date.now();
            const result = await tool.execute(input, context);
            const duration = Date.now() - startTime;

            console.log(`[ToolRegistry] Tool ${name} executed in ${duration}ms`, {
                success: result.success,
                hasData: !!result.data,
                tokenUsage: result.tokenUsage
            });

            return {
                ...result,
                metadata: {
                    ...result.metadata,
                    executionTime: duration
                }
            };
        } catch (error) {
            console.error(`[ToolRegistry] Tool ${name} failed:`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                metadata: { toolName: name }
            };
        }
    }

    /**
     * Execute multiple tools in parallel (for batch mode)
     */
    async executeParallel(
        calls: Array<{ name: string; input: unknown; priority: number }>,
        context: ToolContext
    ): Promise<Map<string, ToolResult>> {
        // Group by priority
        const priorityGroups = new Map<number, typeof calls>();
        for (const call of calls) {
            const group = priorityGroups.get(call.priority) || [];
            group.push(call);
            priorityGroups.set(call.priority, group);
        }

        // Sort priorities
        const sortedPriorities = Array.from(priorityGroups.keys()).sort((a, b) => a - b);

        const results = new Map<string, ToolResult>();

        // Execute each priority group in order, tools within group in parallel
        for (const priority of sortedPriorities) {
            const group = priorityGroups.get(priority)!;

            const groupResults = await Promise.all(
                group.map(async call => {
                    const result = await this.execute(call.name, call.input, context);
                    return { name: call.name, result };
                })
            );

            for (const { name, result } of groupResults) {
                results.set(name, result);
            }
        }

        return results;
    }

    /**
     * Get tool names
     */
    getToolNames(): string[] {
        return Array.from(this.tools.keys());
    }

    /**
     * Get tool count
     */
    size(): number {
        return this.tools.size;
    }

    /**
     * Check if user has required permission level
     */
    private hasPermission(
        userPermissions: PermissionLevel[],
        required: PermissionLevel
    ): boolean {
        const permissionHierarchy: Record<PermissionLevel, number> = {
            [PermissionLevel.READ]: 1,
            [PermissionLevel.WRITE]: 2,
            [PermissionLevel.EXECUTE]: 3,
            [PermissionLevel.ADMIN]: 4
        };

        const requiredLevel = permissionHierarchy[required];

        return userPermissions.some(p => permissionHierarchy[p] >= requiredLevel);
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let registryInstance: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
    if (!registryInstance) {
        registryInstance = new ToolRegistry();
    }
    return registryInstance;
}

export function createToolRegistry(): ToolRegistry {
    return new ToolRegistry();
}
