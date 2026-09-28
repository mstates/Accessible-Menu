// Every page the accessibility gate scans. A 404 fails the run; nothing skips.
// Add "/m/demo", "/a11y/demo", "/feedback/demo", and the directory page when
// the Phase 0 Routes task builds them.
export const pages = ["/"] as const;
