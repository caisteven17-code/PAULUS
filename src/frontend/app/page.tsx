'use client';

import dynamic from 'next/dynamic';

const App = dynamic(() => import('../src/App'), {
  ssr: false,
  loading: () => <div className="min-h-screen bg-[#0c0c0c]" />,
});

export default function Page() {
  return <App />;
}
