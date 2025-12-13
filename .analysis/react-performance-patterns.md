# React Performance Patterns - Best Practices Guide

## Quick Reference

### When to Use Each State Management Solution

| Scenario | Solution | Why |
|----------|----------|-----|
| Frequently updated shared state | Zustand | Prevents parent re-renders |
| Real-time subscriptions | Zustand | Centralized updates, no cascades |
| Form data | `useState` | Local, user-driven, infrequent |
| Modal open/close | `useState` | Local UI state, simple |
| Fetched data (static) | `useState` | One-time fetch, no updates |
| Global app state | Zustand | Shared across components |
| Derived state | `useMemo` | Computed from other state |

## Anti-Pattern: Frequent State Updates in Parent Components

### ❌ Problem Pattern

```typescript
const ParentComponent = () => {
    // BAD: Frequently updated state in parent
    const [logs, setLogs] = useState<LogEntry[]>([]);
    
    // Real-time subscription updates logs frequently
    useEffect(() => {
        const subscription = supabase
            .channel('updates')
            .on('postgres_changes', (payload) => {
                setLogs(prev => [...prev, payload.new]); // Triggers re-render!
            })
            .subscribe();
    }, []);
    
    return (
        <div>
            {/* Every log update re-renders ALL children */}
            <ExpensiveChild logs={logs} />
            <AnotherChild />
            <MoreChildren />
        </div>
    );
};
```

**Problems:**
- Every log update triggers `ParentComponent` re-render
- All children re-render, even if they don't use logs
- React reconciliation overhead for entire tree
- Poor perceived performance

### ✅ Solution Pattern

```typescript
// 1. Create Zustand store for frequently updated state
const useLogsStore = create((set) => ({
    logs: [],
    addLog: (log) => set((state) => ({ logs: [...state.logs, log] })),
    setLogs: (logs) => set({ logs }),
}));

// 2. Parent component stays stable
const ParentComponent = () => {
    // No local state for logs!
    
    useEffect(() => {
        const subscription = supabase
            .channel('updates')
            .on('postgres_changes', (payload) => {
                // Update store directly - no parent re-render!
                useLogsStore.getState().addLog(payload.new);
            })
            .subscribe();
    }, []);
    
    return (
        <div>
            {/* Children only re-render if they subscribe to logs */}
            <LogDisplay /> {/* Subscribes to logs, re-renders */}
            <AnotherChild /> {/* Doesn't subscribe, stays stable */}
            <MoreChildren /> {/* Doesn't subscribe, stays stable */}
        </div>
    );
};

// 3. Only components that need logs subscribe
const LogDisplay = memo(() => {
    const logs = useLogsStore((state) => state.logs);
    return <div>{/* render logs */}</div>;
});
```

**Benefits:**
- ✅ Parent component never re-renders from log updates
- ✅ Only `LogDisplay` re-renders when logs change
- ✅ Other children remain stable
- ✅ Minimal React reconciliation

## Pattern: Memoization for Expensive Components

### When to Memoize

Memoize components that:
1. Render frequently (due to parent updates)
2. Have expensive render logic
3. Receive props that don't change often
4. Are part of a list

### ✅ Basic Memoization

```typescript
const ExpensiveComponent = memo(({ data }) => {
    // Expensive calculations or large DOM tree
    return <div>{/* complex rendering */}</div>;
});
```

### ✅ Memoization with Custom Comparison

```typescript
const ListItem = memo(({ item }) => {
    return <div>{item.name}</div>;
}, (prevProps, nextProps) => {
    // Only re-render if item.id changed
    return prevProps.item.id === nextProps.item.id;
});
```

### ✅ Memoization with useMemo for Derived State

```typescript
const DataDisplay = memo(({ items }) => {
    // Expensive calculation only runs when items change
    const sortedItems = useMemo(() => {
        return items.sort((a, b) => a.name.localeCompare(b.name));
    }, [items]);
    
    return <div>{sortedItems.map(item => <div key={item.id}>{item.name}</div>)}</div>;
});
```

## Pattern: Selective Zustand Subscriptions

### ❌ Over-Subscribing

```typescript
// BAD: Component re-renders on ANY store change
const Component = () => {
    const store = useStore(); // Subscribes to entire store!
    return <div>{store.specificField}</div>;
};
```

### ✅ Selective Subscription

```typescript
// GOOD: Component only re-renders when specificField changes
const Component = () => {
    const specificField = useStore((state) => state.specificField);
    return <div>{specificField}</div>;
};
```

### ✅ Multiple Selective Subscriptions

```typescript
const Component = () => {
    // Each subscription is independent
    const field1 = useStore((state) => state.field1);
    const field2 = useStore((state) => state.field2);
    
    // Component re-renders only when field1 OR field2 changes
    return <div>{field1} - {field2}</div>;
};
```

### ✅ Derived Selectors

```typescript
// Create a selector for derived state
const useFilteredItems = () => {
    return useStore((state) => 
        state.items.filter(item => item.active)
    );
};

const Component = () => {
    const filteredItems = useFilteredItems();
    return <div>{/* render filtered items */}</div>;
};
```

## Pattern: Real-Time Data Management

### ✅ Complete Real-Time Pattern

```typescript
// 1. Define store
const useRealtimeStore = create((set) => ({
    data: [],
    progress: 0,
    status: 'idle',
    
    setData: (data) => set({ data }),
    setProgress: (progress) => set({ progress }),
    setStatus: (status) => set({ status }),
    addItem: (item) => set((state) => ({ data: [...state.data, item] })),
    reset: () => set({ data: [], progress: 0, status: 'idle' }),
}));

// 2. Set up subscription (in a provider or top-level component)
const RealtimeProvider = ({ children }) => {
    const preflightId = usePreflightStore((state) => state.preflightId);
    
    useEffect(() => {
        if (!preflightId) return;
        
        const channel = supabase
            .channel(`realtime-${preflightId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'my_table',
                filter: `id=eq.${preflightId}`
            }, (payload) => {
                // Update store directly - no component re-render!
                useRealtimeStore.getState().setData(payload.new.data);
                useRealtimeStore.getState().setProgress(payload.new.progress);
                useRealtimeStore.getState().setStatus(payload.new.status);
            })
            .subscribe();
        
        return () => {
            supabase.removeChannel(channel);
        };
    }, [preflightId]);
    
    return <>{children}</>;
};

// 3. Consume in memoized components
const ProgressDisplay = memo(() => {
    const progress = useRealtimeStore((state) => state.progress);
    return <div>Progress: {progress}%</div>;
});

const DataDisplay = memo(() => {
    const data = useRealtimeStore((state) => state.data);
    return <div>{data.map(item => <div key={item.id}>{item.name}</div>)}</div>;
});
```

## Pattern: Context vs Zustand

### When to Use Context

```typescript
// ✅ GOOD: Infrequently changing, configuration-like data
const ThemeContext = createContext();

const ThemeProvider = ({ children }) => {
    const [theme, setTheme] = useState('light');
    
    // Theme changes are rare (user action)
    const value = useMemo(() => ({ theme, setTheme }), [theme]);
    
    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
```

### When to Use Zustand

```typescript
// ✅ GOOD: Frequently changing, shared state
const useAppStore = create((set) => ({
    logs: [],
    progress: 0,
    status: 'idle',
    // ... actions
}));

// No provider needed, use anywhere
const Component = () => {
    const logs = useAppStore((state) => state.logs);
    return <div>{/* render logs */}</div>;
};
```

## Common Mistakes and Fixes

### Mistake 1: Prop Drilling Frequently Updated State

```typescript
// ❌ BAD
const App = () => {
    const [logs, setLogs] = useState([]);
    return <Parent logs={logs} setLogs={setLogs} />;
};

const Parent = ({ logs, setLogs }) => {
    return <Child logs={logs} setLogs={setLogs} />;
};

const Child = ({ logs, setLogs }) => {
    return <GrandChild logs={logs} />;
};
```

```typescript
// ✅ GOOD
const useLogsStore = create((set) => ({
    logs: [],
    setLogs: (logs) => set({ logs }),
}));

const App = () => <Parent />;
const Parent = () => <Child />;
const Child = () => <GrandChild />;

const GrandChild = memo(() => {
    const logs = useLogsStore((state) => state.logs);
    return <div>{/* render logs */}</div>;
});
```

### Mistake 2: Not Memoizing Expensive Components

```typescript
// ❌ BAD: Re-renders on every parent update
const ExpensiveList = ({ items }) => {
    return items.map(item => <ExpensiveItem key={item.id} item={item} />);
};
```

```typescript
// ✅ GOOD: Only re-renders when items change
const ExpensiveList = memo(({ items }) => {
    return items.map(item => <ExpensiveItem key={item.id} item={item} />);
});

const ExpensiveItem = memo(({ item }) => {
    return <div>{/* expensive rendering */}</div>;
});
```

### Mistake 3: Creating New Objects in Render

```typescript
// ❌ BAD: Creates new object every render
const Component = () => {
    const config = { option1: true, option2: false }; // New object!
    return <Child config={config} />; // Child always re-renders
};
```

```typescript
// ✅ GOOD: Memoize object creation
const Component = () => {
    const config = useMemo(() => ({ 
        option1: true, 
        option2: false 
    }), []); // Same object every render
    
    return <Child config={config} />; // Child only re-renders if needed
};
```

### Mistake 4: Not Using useCallback for Handlers

```typescript
// ❌ BAD: Creates new function every render
const Parent = () => {
    const handleClick = () => console.log('clicked'); // New function!
    return <Child onClick={handleClick} />; // Child always re-renders
};
```

```typescript
// ✅ GOOD: Memoize function
const Parent = () => {
    const handleClick = useCallback(() => {
        console.log('clicked');
    }, []); // Same function every render
    
    return <Child onClick={handleClick} />; // Child only re-renders if needed
};
```

## Performance Checklist

Before shipping a feature with real-time updates:

- [ ] Frequently updated state is in Zustand, not `useState`
- [ ] Real-time subscriptions update stores directly
- [ ] Components are memoized with `React.memo()`
- [ ] Expensive calculations use `useMemo`
- [ ] Event handlers use `useCallback`
- [ ] Components subscribe selectively to store slices
- [ ] No prop drilling of frequently updated state
- [ ] No new objects/arrays created in render
- [ ] Context is only used for infrequent updates
- [ ] DevTools React Profiler shows minimal re-renders

## Debugging Performance Issues

### Use React DevTools Profiler

1. Open React DevTools
2. Go to Profiler tab
3. Click "Record"
4. Perform the action (e.g., trigger real-time updates)
5. Stop recording
6. Look for:
   - Components that re-render frequently
   - Components with long render times
   - Unnecessary re-renders (props didn't change)

### Use Zustand DevTools

```typescript
import { devtools } from 'zustand/middleware';

const useStore = create(devtools((set) => ({
    // ... store definition
}), { name: 'MyStore' }));
```

Then use Redux DevTools to inspect state changes.

### Add Performance Markers

```typescript
const Component = memo(() => {
    console.log('[Component] Rendering');
    
    useEffect(() => {
        console.log('[Component] Mounted');
        return () => console.log('[Component] Unmounted');
    }, []);
    
    return <div>...</div>;
});
```

## Summary

**Golden Rules:**
1. Frequently updated shared state → Zustand
2. Expensive components → `React.memo()`
3. Expensive calculations → `useMemo`
4. Event handlers → `useCallback`
5. Subscribe selectively → `useStore((state) => state.field)`
6. Real-time updates → Update store directly
7. Local UI state → `useState` is fine

**When in Doubt:**
- Profile with React DevTools
- Check if parent re-renders affect children
- Move frequently updated state to Zustand
- Memoize components that render often
