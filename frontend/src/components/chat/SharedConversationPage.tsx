import { useEffect, useState } from 'react';
import { getSharedConversation, type SharedConversation } from '../../lib/api';
import { cn } from '../../lib/utils';

interface SharedConversationPageProps {
  sessionId: string;
}

export function SharedConversationPage({ sessionId }: SharedConversationPageProps) {
  const [conversation, setConversation] = useState<SharedConversation | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getSharedConversation(sessionId)
      .then((data) => {
        if (active) setConversation(data);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : 'This shared conversation is unavailable.');
      });
    return () => {
      active = false;
    };
  }, [sessionId]);

  return (
    <main className="min-h-screen overflow-y-auto bg-ivory-50 px-4 py-8 text-midnight-900 sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-8 border-b border-green-200 pb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-green-600">NetKathir</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Shared conversation</h1>
        </header>

        {error && (
          <section className="rounded-2xl border border-red-200 bg-white p-6 text-sm text-red-700 shadow-sm">
            {error}
          </section>
        )}

        {!error && !conversation && (
          <p className="text-sm text-midnight-500">Loading conversation...</p>
        )}

        {conversation && (
          <section className="space-y-4">
            {conversation.messages.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
                className={cn(
                  'max-w-[88%] rounded-2xl border px-4 py-3 text-sm leading-relaxed shadow-sm',
                  message.role === 'user'
                    ? 'ml-auto border-green-200 bg-green-600 text-white'
                    : 'border-green-100 bg-white text-midnight-800',
                )}
              >
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-60">
                  {message.role === 'user' ? 'You' : 'NetKathir'}
                </p>
                <p className="whitespace-pre-wrap">{message.content}</p>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
