import { randomUUID } from "node:crypto";
import type pg from "pg";
import {
  assertDiscordUserId,
  assertOptionalDiscordId,
  assertPositiveInteger,
} from "./validation.js";

export type EconomyFailure =
  | "invalid_amount"
  | "invalid_user"
  | "user_not_found"
  | "insufficient_balance"
  | "same_user";

export type EconomyResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: EconomyFailure };

export type CurrencyOptions = {
  type: string;
  relatedUserId?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

function validateOptions(options: CurrencyOptions) {
  if (!/^[a-z][a-z0-9:_-]{0,63}$/.test(options.type)) {
    throw new Error("Invalid transaction type.");
  }
  assertOptionalDiscordId(options.relatedUserId);
}

export class EconomyService {
  constructor(private readonly pool: pg.Pool) {}

  async getBalance(discordId: string): Promise<EconomyResult<number>> {
    try {
      assertDiscordUserId(discordId);
    } catch {
      return { ok: false, error: "invalid_user" };
    }
    const result = await this.pool.query<{ currency: number }>(
      "SELECT currency FROM mudae_users WHERE discord_id = $1",
      [discordId],
    );
    if (!result.rowCount) return { ok: false, error: "user_not_found" };
    return { ok: true, value: Number(result.rows[0].currency) };
  }

  async addCurrency(
    discordId: string,
    amount: number,
    options: CurrencyOptions,
  ): Promise<EconomyResult<number>> {
    return this.mutateBalance(discordId, amount, options, false);
  }

  async removeCurrency(
    discordId: string,
    amount: number,
    options: CurrencyOptions,
  ): Promise<EconomyResult<number>> {
    return this.mutateBalance(discordId, amount, options, true);
  }

  async canAfford(
    discordId: string,
    amount: number,
  ): Promise<EconomyResult<boolean>> {
    const balance = await this.getBalance(discordId);
    if (!balance.ok) return balance;
    try {
      assertPositiveInteger(amount, "Amount");
    } catch {
      return { ok: false, error: "invalid_amount" };
    }
    return { ok: true, value: balance.value >= amount };
  }

  async transferCurrency(
    fromUserId: string,
    toUserId: string,
    amount: number,
    options: Omit<CurrencyOptions, "relatedUserId">,
  ): Promise<EconomyResult<{ fromBalance: number; toBalance: number }>> {
    try {
      assertDiscordUserId(fromUserId);
      assertDiscordUserId(toUserId);
      assertPositiveInteger(amount, "Amount");
      validateOptions(options);
    } catch {
      return {
        ok: false,
        error: fromUserId === toUserId ? "same_user" : "invalid_amount",
      };
    }
    if (fromUserId === toUserId) return { ok: false, error: "same_user" };

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const debit = await client.query<{ currency: number }>(
        `UPDATE mudae_users SET currency = currency - $1, updated_at = NOW()
         WHERE discord_id = $2 AND currency >= $1 RETURNING currency`,
        [amount, fromUserId],
      );
      if (!debit.rowCount) {
        await client.query("ROLLBACK");
        const exists = await this.pool.query(
          "SELECT 1 FROM mudae_users WHERE discord_id = $1",
          [fromUserId],
        );
        return {
          ok: false,
          error: exists.rowCount ? "insufficient_balance" : "user_not_found",
        };
      }
      const credit = await client.query<{ currency: number }>(
        `UPDATE mudae_users SET currency = currency + $1, updated_at = NOW()
         WHERE discord_id = $2 RETURNING currency`,
        [amount, toUserId],
      );
      if (!credit.rowCount) {
        await client.query("ROLLBACK");
        return { ok: false, error: "user_not_found" };
      }
      await this.recordTransaction(client, fromUserId, amount, "transfer_out", toUserId, options.metadata);
      await this.recordTransaction(client, toUserId, amount, "transfer_in", fromUserId, options.metadata);
      await client.query("COMMIT");
      return {
        ok: true,
        value: {
          fromBalance: Number(debit.rows[0].currency),
          toBalance: Number(credit.rows[0].currency),
        },
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async mutateBalance(
    discordId: string,
    amount: number,
    options: CurrencyOptions,
    remove: boolean,
  ): Promise<EconomyResult<number>> {
    try {
      assertDiscordUserId(discordId);
      assertPositiveInteger(amount, "Amount");
      validateOptions(options);
    } catch {
      return { ok: false, error: "invalid_amount" };
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const operator = remove ? "-" : "+";
      const result = await client.query<{ currency: number }>(
        `UPDATE mudae_users SET currency = currency ${operator} $1, updated_at = NOW()
         WHERE discord_id = $2${remove ? " AND currency >= $1" : ""}
         RETURNING currency`,
        [amount, discordId],
      );
      if (!result.rowCount) {
        await client.query("ROLLBACK");
        const exists = await this.pool.query(
          "SELECT 1 FROM mudae_users WHERE discord_id = $1",
          [discordId],
        );
        return {
          ok: false,
          error: exists.rowCount
            ? remove
              ? "insufficient_balance"
              : "user_not_found"
            : "user_not_found",
        };
      }
      await this.recordTransaction(
        client,
        discordId,
        amount,
        options.type,
        options.relatedUserId,
        options.metadata,
      );
      await client.query("COMMIT");
      return { ok: true, value: Number(result.rows[0].currency) };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async recordTransaction(
    client: pg.PoolClient,
    discordId: string,
    amount: number,
    type: string,
    relatedUserId?: string,
    metadata?: CurrencyOptions["metadata"],
  ) {
    await client.query(
      `INSERT INTO mudae_currency_transactions
       (id, discord_id, related_discord_id, amount, transaction_type, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), discordId, relatedUserId ?? null, amount, type, metadata ?? null],
    );
  }
}