export function normalizeSearchQuery(query) {
    return query.trim().replace(/\s+/g, " ");
}
export function resolveCharacterMatches(query, matches) {
    const normalizedQuery = normalizeSearchQuery(query).toLocaleLowerCase();
    if (!normalizedQuery || !matches.length) {
        return { status: "not_found", matches: [] };
    }
    const exact = matches.filter((match) => [match.name, match.series].some((value) => normalizeSearchQuery(value).toLocaleLowerCase() === normalizedQuery));
    if (exact.length === 1)
        return { status: "resolved", character: exact[0] };
    if (exact.length > 1)
        return { status: "ambiguous", matches: exact };
    if (matches.length === 1)
        return { status: "resolved", character: matches[0] };
    return { status: "ambiguous", matches };
}
export function normalizePagination(page, pageSize, totalItems) {
    const safePageSize = Math.max(1, Math.min(Math.floor(pageSize) || 1, 25));
    const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
    const currentPage = Math.max(1, Math.min(Math.floor(page) || 1, totalPages));
    return {
        page: currentPage,
        pageSize: safePageSize,
        totalPages,
        offset: (currentPage - 1) * safePageSize,
    };
}
