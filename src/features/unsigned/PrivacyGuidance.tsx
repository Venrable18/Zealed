/**
 * Advice for someone sending sensitive information. It is shown before they write, and always
 * visible. It says what Zealed can and cannot do: it hides who paid on the blockchain, but it
 * cannot hide who you are from your own device, network or the way you write.
 */
export function PrivacyGuidance() {
  return (
    <aside
      aria-labelledby="privacy-guidance"
      className="space-y-3 rounded-card border border-line bg-surface p-5"
    >
      <h2 id="privacy-guidance" className="text-lg">
        Before you send
      </h2>
      <ul className="list-disc space-y-2 pl-5 text-sm">
        <li>
          <strong>Use a separate wallet.</strong> Fund it with money that cannot be traced to you,
          not the wallet you use every day. A payment from your usual wallet can point back to you.
        </li>
        <li>
          <strong>Leave out details that identify you.</strong> Names, places, dates and the way you
          write can all give you away. The message is private, but its content can still identify
          you to the person who reads it.
        </li>
        <li>
          <strong>Hide your network address.</strong> Zealed hides who paid on the blockchain, not
          your internet connection. Consider Tor Browser. Note that this app needs JavaScript, so
          Tor Browser’s “Safest” security level will not work; use “Standard” or “Safer”.
        </li>
        <li>
          <strong>Amounts and timing can be matched.</strong> If you tell someone how much you paid
          and when, they could recognise your payment. Avoid doing that.
        </li>
        <li>
          <strong>A reply address links your messages.</strong> If you ask for a reply, a fresh
          address is made for it, but anyone who reads your replies knows you are the same sender.
        </li>
      </ul>
    </aside>
  )
}
