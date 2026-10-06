export const metadata = { title: "Sign in · Sales Dashboard" };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="login">
      <form method="post" action="/api/login" className="card login-card">
        <h1>Sales Dashboard</h1>
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoFocus required autoComplete="current-password" />
        {error && <p className="error">That password didn&apos;t work.</p>}
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
