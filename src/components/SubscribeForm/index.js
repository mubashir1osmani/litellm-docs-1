import React from 'react';
import {LOOPS_FORM_URL} from '@site/src/config';
import styles from './styles.module.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function SubscribeForm() {
  const [email, setEmail] = React.useState('');
  const [honeypot, setHoneypot] = React.useState('');
  const [status, setStatus] = React.useState('idle');

  async function handleSubmit(e) {
    e.preventDefault();

    if (honeypot) {
      setStatus('success');
      return;
    }

    if (!EMAIL_RE.test(email)) {
      setStatus('invalid');
      return;
    }

    setStatus('loading');
    try {
      const res = await fetch(LOOPS_FORM_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({email}),
      });
      if (res.ok) {
        setStatus('success');
        setEmail('');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  }

  if (status === 'success') {
    return <p className={`${styles.feedback} ${styles.success}`}>We'll keep you posted!</p>;
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <div className={styles.honeypot} aria-hidden="true">
        <input
          type="text"
          name="website"
          value={honeypot}
          onChange={e => setHoneypot(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      <div className={styles.row}>
        <input
          type="email"
          value={email}
          onChange={e => {
            setEmail(e.target.value);
            if (status === 'invalid') setStatus('idle');
          }}
          placeholder="you@example.com"
          required
          disabled={status === 'loading'}
          className={`${styles.input} ${status === 'invalid' ? styles.inputError : ''}`}
        />
        <button type="submit" disabled={status === 'loading'} className={styles.btn}>
          {status === 'loading' ? 'Subscribing…' : 'Subscribe'}
        </button>
      </div>
      {status === 'invalid' && (
        <p className={`${styles.feedback} ${styles.error}`}>Please enter a valid email address.</p>
      )}
      {status === 'error' && (
        <p className={`${styles.feedback} ${styles.error}`}>Something went wrong. Try again.</p>
      )}
    </form>
  );
}
