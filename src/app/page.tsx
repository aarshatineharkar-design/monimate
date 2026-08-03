import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#1a1a2e' }}>
      <div className="text-center px-6">
        <div className="text-6xl mb-4">🐷</div>
        <h1 className="text-4xl font-bold mb-2" style={{ color: '#f0c038' }}>MoniMate</h1>
        <p className="text-lg mb-1" style={{ color: '#eee' }}>A Financial Life RPG</p>
        <p className="text-sm mb-8 max-w-md mx-auto" style={{ color: '#8892a4' }}>
          Learn to manage money by living through it — from pocket money to pay cheques.
          No quizzes, no lectures. Just real decisions with real consequences.
        </p>
        <Link href="/game"
          className="inline-block px-10 py-4 rounded-full text-lg font-bold no-underline hover:opacity-90 transition-opacity"
          style={{ background: '#f0c038', color: '#1a1a2e' }}>
          Play Now
        </Link>
        <p className="text-xs mt-6" style={{ color: '#8892a4' }}>
          A COMPX576 project — University of Waikato
        </p>
      </div>
    </div>
  );
}
