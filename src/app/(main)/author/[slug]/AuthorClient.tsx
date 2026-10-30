'use client';
import AuthorPage from '@/views/AuthorPage';
import type { Author } from '@/data/authors';

export default function AuthorClient({ author }: { author: Author }) {
  return <AuthorPage author={author} />;
}
