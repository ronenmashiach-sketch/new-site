'use client';

import { useCallback, useEffect, useState } from 'react';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { GripVertical } from 'lucide-react';
import { NEWS_SOURCES } from '@/lib/newsSources';
import { mergeOrderWithCatalog, sortSourcesByKeyOrder } from '@/lib/newsSourceOrder';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

function reorder(list, start, end) {
  const next = [...list];
  const [removed] = next.splice(start, 1);
  next.splice(end, 0, removed);
  return next;
}

export function AdminNewsSourceOrderPanel() {
  const [sources, setSources] = useState(() => [...NEWS_SOURCES]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveState, setSaveState] = useState('idle');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch('/api/news-source-order', { cache: 'no-store', credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data?.keys)) {
        setLoadError('לא ניתן לטעון את הסדר.');
        setSources([...NEWS_SOURCES]);
        return;
      }
      const keys = mergeOrderWithCatalog(data.keys, NEWS_SOURCES);
      setSources(sortSourcesByKeyOrder(NEWS_SOURCES, keys));
    } catch {
      setLoadError('לא ניתן לטעון את הסדר.');
      setSources([...NEWS_SOURCES]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(async (nextSources) => {
    setSaveState('saving');
    try {
      const res = await fetch('/api/admin/news-source-order', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: nextSources.map((s) => s.key) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveState('error');
        setLoadError(typeof data?.message === 'string' ? data.message : 'השמירה נכשלה.');
        await load();
        return;
      }
      setSaveState('saved');
      setLoadError('');
      window.setTimeout(() => setSaveState('idle'), 2000);
    } catch {
      setSaveState('error');
      setLoadError('השמירה נכשלה.');
      await load();
    }
  }, [load]);

  const onDragEnd = useCallback(
    (result) => {
      if (!result.destination) return;
      const { source, destination } = result;
      if (source.index === destination.index) return;
      const next = reorder(sources, source.index, destination.index);
      setSources(next);
      void persist(next);
    },
    [sources, persist],
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">סידור כתבות</h1>
        <p className="text-sm text-muted-foreground">
          גררו את הקוביות כדי לקבוע את סדר המקורות בדף הבית. הסדר נשמר בקובץ בשרת.
        </p>
      </div>

      <Card>
        <CardHeader className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-lg">מקורות חדשות</CardTitle>
            {saveState !== 'idle' ? (
              <span
                className={cn(
                  'text-xs font-medium',
                  saveState === 'saving' && 'text-muted-foreground',
                  saveState === 'saved' && 'text-emerald-600',
                  saveState === 'error' && 'text-destructive',
                )}
                aria-live="polite"
              >
                {saveState === 'saving' ? 'שומרים…' : saveState === 'saved' ? 'נשמר' : 'שגיאה'}
              </span>
            ) : null}
          </div>
          <CardDescription>
            {loading ? 'טוען…' : `${sources.length} אתרים — הסדר משפיע על דף הבית לאחר רענון.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <p className="mb-4 text-sm text-destructive" role="alert">
              {loadError}
            </p>
          ) : null}
          {!loading ? (
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="news-sources-order">
                {(dropProvided) => (
                  <ul
                    ref={dropProvided.innerRef}
                    {...dropProvided.droppableProps}
                    className="space-y-2"
                  >
                    {sources.map((source, index) => (
                      <Draggable key={source.key} draggableId={source.key} index={index}>
                        {(dragProvided, snapshot) => (
                          <li
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            className={cn(
                              'flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm',
                              snapshot.isDragging && 'shadow-md ring-2 ring-primary/20',
                            )}
                          >
                            <span
                              {...dragProvided.dragHandleProps}
                              className="cursor-grab text-muted-foreground active:cursor-grabbing"
                              aria-label="גרירה"
                            >
                              <GripVertical className="size-5" />
                            </span>
                            <span className="text-lg leading-none" aria-hidden>
                              {source.flag}
                            </span>
                            <div className="min-w-0 flex-1 text-right">
                              <p className="truncate text-sm font-medium">{source.name}</p>
                              <p className="truncate text-xs text-muted-foreground">{source.key}</p>
                            </div>
                          </li>
                        )}
                      </Draggable>
                    ))}
                    {dropProvided.placeholder}
                  </ul>
                )}
              </Droppable>
            </DragDropContext>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
