'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, BotServer } from '@/lib/api';
import Console from '@/components/Console';
import ResourceGraph from '@/components/ResourceGraph';
import ServerInfoBar from '@/components/ServerInfoBar';

export default function ServerConsolePage() {
  const params = useParams();
  const serverId = params.id as string;
  const [server, setServer] = useState<BotServer | null>(null);

  useEffect(() => {
    api.get(`/servers/${serverId}`).then((res) => setServer(res.data));
  }, [serverId]);

  return (
    <div className="space-y-6">
      <ServerInfoBar serverId={serverId} />
      {server && <ResourceGraph serverId={serverId} cpuLimit={server.cpuLimitPercent} />}
      <Console serverId={serverId} />
    </div>
  );
}
