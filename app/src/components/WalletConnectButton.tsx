"use client";

import dynamic from "next/dynamic";

// See WalletConnectButtonImpl.tsx for the component itself and why it's
// SSR-disabled (wallet state depends on localStorage, unavailable on the
// server and the client's very first render alike). The placeholder matches
// the button's height so the form doesn't jump when it loads in.
export const WalletConnectButton = dynamic(
  async () => (await import("./WalletConnectButtonImpl")).WalletConnectButtonImpl,
  {
    ssr: false,
    loading: () => <div className="skeleton" style={{ height: 44, borderRadius: 11 }} aria-hidden="true" />,
  },
);
