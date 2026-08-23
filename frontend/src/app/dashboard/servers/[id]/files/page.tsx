'use client';

import { useParams } from 'next/navigation';
import FileManager from '@/components/FileManager';

export default function ServerFilesPage() {
  const params = useParams();
  return <FileManager serverId={params.id as string} />;
}
