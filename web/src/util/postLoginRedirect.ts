export function getPostLoginRedirectTarget(
  currentHostname: string,
  currentProtocol: string,
  next: string | null,
): string | null {
  const apexHost = currentHostname.replace(/^www\./, "");
  if (
    !next ||
    !apexHost ||
    apexHost === "localhost" ||
    apexHost.startsWith("admin.")
  ) {
    return null;
  }

  try {
    const target = new URL(next, `${currentProtocol}//${currentHostname}`);
    if (
      target.protocol === currentProtocol &&
      target.hostname === `admin.${apexHost}`
    ) {
      return target.toString();
    }
  } catch {
    return null;
  }

  // Allow same-origin /pieces/* redirects (e.g. showcase preview after login)
  try {
    const target = new URL(next, `${currentProtocol}//${currentHostname}`);
    if (
      target.protocol === currentProtocol &&
      target.hostname === currentHostname &&
      target.pathname.startsWith("/pieces/")
    ) {
      return target.toString();
    }
  } catch {
    return null;
  }

  return null;
}
