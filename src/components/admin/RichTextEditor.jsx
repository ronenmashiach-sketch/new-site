'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

import 'react-quill/dist/quill.snow.css';

const ReactQuill = dynamic(() => import('react-quill'), {
  ssr: false,
  loading: () => (
    <div className="flex h-40 items-center justify-center rounded-md border border-border bg-muted/30 text-sm text-muted-foreground">
      טוען עורך…
    </div>
  ),
});

const TOOLBAR = [
  [{ header: [1, 2, 3, false] }],
  [{ size: ['small', false, 'large', 'huge'] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ color: [] }, { background: [] }],
  [{ align: [] }],
  ['clean'],
];

/**
 * @param {{ value: string, onChange: (html: string) => void, disabled?: boolean, placeholder?: string, className?: string, minHeight?: number }} props
 */
export function RichTextEditor({
  value,
  onChange,
  disabled = false,
  placeholder = 'הקלידו כאן…',
  className,
  minHeight = 120,
}) {
  const modules = useMemo(
    () => ({
      toolbar: TOOLBAR,
      clipboard: { matchVisual: false },
    }),
    [],
  );

  const formats = useMemo(
    () => [
      'header',
      'size',
      'bold',
      'italic',
      'underline',
      'strike',
      'color',
      'background',
      'align',
    ],
    [],
  );

  return (
    <div
      className={cn(
        'site-rich-editor overflow-hidden rounded-md border border-border bg-background shadow-sm',
        disabled && 'pointer-events-none opacity-60',
        className,
      )}
      style={{ '--editor-min-height': `${minHeight}px` }}
    >
      <ReactQuill
        theme="snow"
        value={value}
        onChange={onChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder}
        readOnly={disabled}
      />
    </div>
  );
}
