function assertRandomValue(value) {
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
        throw new Error("Random source must return a value in [0, 1).");
    }
}
export function randomInt(min, max, random = Math.random) {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) {
        throw new Error("Random integer bounds are invalid.");
    }
    const value = random();
    assertRandomValue(value);
    return min + Math.floor(value * (max - min + 1));
}
export function weightedChoice(outcomes, random = Math.random) {
    if (!outcomes.length || outcomes.some(({ weight }) => !Number.isFinite(weight) || weight <= 0)) {
        throw new Error("Weighted outcomes must contain positive finite weights.");
    }
    const total = outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
    const value = random();
    assertRandomValue(value);
    let cursor = value * total;
    for (const outcome of outcomes) {
        cursor -= outcome.weight;
        if (cursor < 0)
            return outcome.item;
    }
    return outcomes[outcomes.length - 1].item;
}
