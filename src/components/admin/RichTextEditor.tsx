import { useEffect, useRef } from 'react';
import { Bold, Italic, List, ListOrdered, Link2 } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: number;
}

/**
 * A minimal rich-text field for product and post descriptions.
 *
 * The toolbar is a row of `BUTTON.ghost`-styled icon buttons and the editable
 * area borrows the console's field border, so it reads as one control with the
 * inputs beside it rather than a third-party widget bolted into the form.
 */
export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write product description…',
  minHeight = 180,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editorRef.current) return;
    if (editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
    }
  }, [value]);

  const exec = (command: string, valueArg?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, valueArg);
    onChange(editorRef.current?.innerHTML || '');
  };

  const handleInput = () => {
    onChange(editorRef.current?.innerHTML || '');
  };

  const addLink = () => {
    const url = window.prompt('Enter URL');
    if (url) exec('createLink', url);
  };

  const tool =
    'rounded-lg p-2 text-admin-muted transition-colors hover:bg-admin-surface hover:text-admin-ink';

  return (
    <div className="overflow-hidden rounded-xl border border-admin-line bg-admin-surface focus-within:border-himalayan focus-within:ring-2 focus-within:ring-himalayan/25">
      <div className="flex items-center gap-1 border-b border-admin-line bg-admin-canvas px-2 py-1.5">
        <button type="button" onClick={() => exec('bold')} className={tool} title="Bold" aria-label="Bold">
          <Bold size={16} />
        </button>
        <button type="button" onClick={() => exec('italic')} className={tool} title="Italic" aria-label="Italic">
          <Italic size={16} />
        </button>
        <button
          type="button"
          onClick={() => exec('insertUnorderedList')}
          className={tool}
          title="Bullet list"
          aria-label="Bullet list"
        >
          <List size={16} />
        </button>
        <button
          type="button"
          onClick={() => exec('insertOrderedList')}
          className={tool}
          title="Numbered list"
          aria-label="Numbered list"
        >
          <ListOrdered size={16} />
        </button>
        <button type="button" onClick={addLink} className={tool} title="Add link" aria-label="Add link">
          <Link2 size={16} />
        </button>
        <span className="ml-auto pr-1 text-[11px] text-admin-muted">Basic formatting</span>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-placeholder={placeholder}
        className="prose prose-sm max-w-none px-4 py-3 text-sm text-admin-ink outline-none empty:before:text-admin-muted empty:before:content-[attr(data-placeholder)]"
        style={{ minHeight }}
      />
    </div>
  );
}
