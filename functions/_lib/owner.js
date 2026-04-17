const OWNER_EMAILS = ['bontecouc@gmail.com', 'codybontecou@gmail.com', 'cody@isolated.tech'];

export function isOwner(session) {
  return Boolean(session?.email && OWNER_EMAILS.includes(session.email));
}
