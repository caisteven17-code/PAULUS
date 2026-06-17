'use client';

import dynamic from 'next/dynamic';
import { LoadingScreen } from '../src/components/ui/LoadingScreen';

// Show the branded loading screen the instant the page hydrates — i.e. right
// after a browser refresh — instead of a blank gap while the App chunk loads.
const App = dynamic(() => import('../src/App'), {
  ssr: false,
  loading: () => <LoadingScreen label="Preparing" />,
});

export default function Page() {
  return <App />;
}
