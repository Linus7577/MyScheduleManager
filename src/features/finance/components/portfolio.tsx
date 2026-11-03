"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { CircleDollarSign, Pencil, Plus, RefreshCw, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BASE_CURRENCY, FOREIGN_CURRENCIES, MARKET_CURRENCY, MARKETS, type ForeignCurrency, type Market } from "@/config/finance.config";
import { OTHER_COLOR, SERIES_COLORS } from "@/features/command/components/chart-palette";
import { FormDialog } from "@/features/schedule/components/form-dialog";
import { FIELD_CLASS } from "@/features/schedule/components/meta";
import { useScheduleAction } from "@/features/schedule/components/use-action";
import {
  createTradeAction,
  deleteTradeAction,
  recordDividendAction,
  refreshMarketAction,
  setManualFxAction,
  setManualPriceAction,
  updateTradeAction,
} from "../actions";
import type { AllocationSlice, FxRate, PortfolioSnapshot, PortfolioTotals, Trade, TradeSide, ValuedHolding } from "../types";
import { ValueHistoryChart } from "./chart-loaders";
import { moneyFormat, shortDateFormat, signedMoneyFormat, toUtcDate } from "./format";

function TradeDialog(props: { trade: Trade | null; rates: FxRate[]; today: string; onClose: () => void }) {
  const t = useTranslations("finance");
  const { pending, error, run } = useScheduleAction();
  const { trade } = props;
  const [side, setSide] = useState<TradeSide>(trade?.side ?? "buy");
  const [market, setMarket] = useState<Market>(trade?.market ?? "US");
  const [symbol, setSymbol] = useState(trade?.symbol ?? "");
  const [quantity, setQuantity] = useState(trade ? String(trade.quantity) : "");
  const [price, setPrice] = useState(trade ? String(trade.price) : "");
  const [fee, setFee] = useState(trade ? String(trade.fee) : "0");
  const [date, setDate] = useState(trade?.date ?? props.today);
  const [note, setNote] = useState(trade?.note ?? "");
  const [rate, setRate] = useState(trade && trade.currency !== BASE_CURRENCY ? String(trade.fx_rate) : "");

  const currency = MARKET_CURRENCY[market];
  const storedRate = props.rates.find((row) => row.currency === currency)?.rate;

  function save() {
    const fields = {
      side,
      market,
      symbol,
      quantity: Number(quantity),
      price: Number(price),
      fee: Number(fee || 0),
      date,
      note,
      fx_rate: currency === BASE_CURRENCY || rate === "" ? null : Number(rate),
    };
    run(() => (trade ? updateTradeAction({ id: trade.id, ...fields }) : createTradeAction(fields)), props.onClose);
  }

  return (
    <FormDialog open onClose={props.onClose} title={trade ? t("editTrade") : t("newTrade")} pending={pending} error={error} onSubmit={save}>
      <div className="flex gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label htmlFor="trade-side">{t("side")}</Label>
          <select id="trade-side" className={FIELD_CLASS} value={side} onChange={(e) => setSide(e.target.value as TradeSide)}>
            <option value="buy">{t("buy")}</option>
            <option value="sell">{t("sell")}</option>
          </select>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label htmlFor="trade-market">{t("market")}</Label>
          <select id="trade-market" className={FIELD_CLASS} value={market} onChange={(e) => setMarket(e.target.value as Market)}>
            {MARKETS.map((option) => (
              <option key={option} value={option}>
                {t(`markets.${option}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="trade-symbol">{t("symbol")}</Label>
        <Input
          id="trade-symbol"
          required
          maxLength={16}
          autoCapitalize="characters"
          placeholder={market === "US" ? "AAPL" : "2330"}
          className="h-11"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label htmlFor="trade-quantity">{t("quantity")}</Label>
          <Input id="trade-quantity" type="number" inputMode="decimal" step="any" min="0" required className="h-11" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label htmlFor="trade-price">{t("pricePer", { currency })}</Label>
          <Input id="trade-price" type="number" inputMode="decimal" step="any" min="0" required className="h-11" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label htmlFor="trade-fee">{t("feeIn", { currency })}</Label>
          <Input id="trade-fee" type="number" inputMode="decimal" step="any" min="0" className="h-11" value={fee} onChange={(e) => setFee(e.target.value)} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label htmlFor="trade-date">{t("date")}</Label>
          <Input id="trade-date" type="date" required className="h-11" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      {currency !== BASE_CURRENCY && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="trade-rate">{t("rateToTwd", { currency })}</Label>
          <Input
            id="trade-rate"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            className="h-11"
            placeholder={storedRate === undefined ? "" : String(storedRate)}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="trade-note">{t("note")}</Label>
        <Input id="trade-note" maxLength={500} className="h-11" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </FormDialog>
  );
}

function PriceDialog({ holding, onClose }: { holding: ValuedHolding; onClose: () => void }) {
  const t = useTranslations("finance");
  const { pending, error, run } = useScheduleAction();
  const manual = holding.price_source === "manual";
  const [price, setPrice] = useState(manual && holding.price !== null ? String(holding.price) : "");
  const { market, symbol } = holding;

  return (
    <FormDialog
      open
      onClose={onClose}
      title={t("setPriceFor", { symbol })}
      pending={pending}
      error={error}
      onSubmit={() => run(() => setManualPriceAction({ market, symbol, price: Number(price) }), onClose)}
      extraAction={
        manual ? (
          <Button type="button" variant="ghost" disabled={pending} className="h-11 px-2" onClick={() => run(() => setManualPriceAction({ market, symbol, price: null }), onClose)}>
            {t("useFetchedPrice")}
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="manual-price">{t("pricePer", { currency: holding.currency })}</Label>
        <Input id="manual-price" type="number" inputMode="decimal" step="any" min="0" required className="h-11" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground">{t("manualPriceHint")}</p>
    </FormDialog>
  );
}

function DividendDialog({ holding, today, onClose }: { holding: ValuedHolding; today: string; onClose: () => void }) {
  const t = useTranslations("finance");
  const { pending, error, run } = useScheduleAction();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");

  return (
    <FormDialog
      open
      onClose={onClose}
      title={t("dividendFor", { symbol: holding.symbol })}
      pending={pending}
      error={error}
      onSubmit={() =>
        run(() => recordDividendAction({ market: holding.market, symbol: holding.symbol, amount: Number(amount), date, note }), onClose)
      }
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="dividend-amount">{t("amountIn", { currency: holding.currency })}</Label>
        <Input id="dividend-amount" type="number" inputMode="decimal" step="0.01" min="0.01" required className="h-11" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="dividend-date">{t("date")}</Label>
        <Input id="dividend-date" type="date" required className="h-11" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="dividend-note">{t("note")}</Label>
        <Input id="dividend-note" maxLength={500} className="h-11" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground">{t("dividendHint")}</p>
    </FormDialog>
  );
}

function FxDialog({ currency, onClose }: { currency: ForeignCurrency; onClose: () => void }) {
  const t = useTranslations("finance");
  const { pending, error, run } = useScheduleAction();
  const [rate, setRate] = useState("");

  return (
    <FormDialog
      open
      onClose={onClose}
      title={t("setRateFor", { currency })}
      pending={pending}
      error={error}
      onSubmit={() => run(() => setManualFxAction({ currency, rate: Number(rate) }), onClose)}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="manual-rate">{t("rateToTwd", { currency })}</Label>
        <Input id="manual-rate" type="number" inputMode="decimal" step="any" min="0" required className="h-11" value={rate} onChange={(e) => setRate(e.target.value)} />
      </div>
    </FormDialog>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold break-words tabular-nums">{value}</p>
    </div>
  );
}

/** Colour follows the holding, not its size, so a holding keeps its colour as values change. */
function AllocationBar({ title, slices, colorOf }: { title: string; slices: AllocationSlice[]; colorOf: (key: string) => string }) {
  const format = useFormatter();
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <div aria-hidden="true" className="flex h-4 gap-0.5 overflow-hidden rounded">
        {slices.map((slice) => (
          <div key={slice.key} style={{ width: `${Math.max(slice.percent, 1)}%`, backgroundColor: colorOf(slice.key) }} />
        ))}
      </div>
      <ul className="flex flex-col gap-1 text-xs">
        {slices.map((slice) => (
          <li key={slice.key} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: colorOf(slice.key) }} />
            <span className="min-w-0 flex-1 break-words">{slice.label}</span>
            <span className="text-muted-foreground tabular-nums">
              {slice.percent}% · {format.number(slice.value_twd, moneyFormat(BASE_CURRENCY))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HoldingCard(props: { holding: ValuedHolding; dividends: number; onSetPrice: () => void; onDividend: () => void }) {
  const t = useTranslations("finance");
  const format = useFormatter();
  const { holding } = props;
  const native = (value: number) => format.number(value, moneyFormat(holding.currency));
  const twd = (value: number) => format.number(value, moneyFormat(BASE_CURRENCY));

  const priceNote =
    holding.price_source === "manual"
      ? t("priceManual")
      : holding.price_source
        ? t("priceFrom", {
            source: t(`priceSources.${holding.price_source}`),
            date: holding.price_date ? format.dateTime(toUtcDate(holding.price_date), shortDateFormat) : "",
          })
        : t("priceMissing");

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <p className="font-medium">
          {holding.symbol} <span className="text-xs font-normal text-muted-foreground">{t(`markets.${holding.market}`)}</span>
        </p>
        <p className="text-right font-medium tabular-nums">
          {holding.market_value_twd === null ? t("noValue") : twd(holding.market_value_twd)}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">{t("quantity")}</dt>
        <dd className="text-right tabular-nums">{format.number(holding.quantity, { maximumFractionDigits: 6 })}</dd>
        <dt className="text-muted-foreground">{t("averageCost")}</dt>
        <dd className="text-right tabular-nums">{native(holding.average_cost)}</dd>
        <dt className="text-muted-foreground">{t("price")}</dt>
        <dd className="text-right tabular-nums">{holding.price === null ? "—" : native(holding.price)}</dd>
        {holding.currency !== BASE_CURRENCY && holding.market_value !== null && (
          <>
            <dt className="text-muted-foreground">{t("valueIn", { currency: holding.currency })}</dt>
            <dd className="text-right tabular-nums">{native(holding.market_value)}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{t("unrealized")}</dt>
        <dd className="text-right tabular-nums">
          {holding.unrealized_twd === null
            ? "—"
            : `${format.number(holding.unrealized_twd, signedMoneyFormat(BASE_CURRENCY))}${
                holding.unrealized_percent === null ? "" : ` (${format.number(holding.unrealized_percent, { signDisplay: "exceptZero", maximumFractionDigits: 2 })}%)`
              }`}
        </dd>
        <dt className="text-muted-foreground">{t("realized")}</dt>
        <dd className="text-right tabular-nums">{format.number(holding.realized_twd, signedMoneyFormat(BASE_CURRENCY))}</dd>
        {props.dividends > 0 && (
          <>
            <dt className="text-muted-foreground">{t("dividends")}</dt>
            <dd className="text-right tabular-nums">{twd(props.dividends)}</dd>
          </>
        )}
      </dl>
      <p className="text-xs text-muted-foreground">{priceNote}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="h-10 gap-1.5 px-3" aria-label={t("setPriceFor", { symbol: holding.symbol })} onClick={props.onSetPrice}>
          <Tag className="size-3.5" aria-hidden="true" />
          {t("setPrice")}
        </Button>
        <Button type="button" variant="outline" className="h-10 gap-1.5 px-3" aria-label={t("dividendFor", { symbol: holding.symbol })} onClick={props.onDividend}>
          <CircleDollarSign className="size-3.5" aria-hidden="true" />
          {t("addDividend")}
        </Button>
      </div>
    </li>
  );
}

export function PortfolioPage(props: {
  valued: ValuedHolding[];
  totals: PortfolioTotals;
  trades: Trade[];
  rates: FxRate[];
  snapshots: PortfolioSnapshot[];
  byHolding: AllocationSlice[];
  byMarket: AllocationSlice[];
  dividendsTwd: number;
  dividendsByHolding: Record<string, number>;
  hasUsSource: boolean;
  today: string;
}) {
  const t = useTranslations("finance");
  const format = useFormatter();
  const { pending, error, run } = useScheduleAction();
  const [tradeDialog, setTradeDialog] = useState<{ trade: Trade | null } | null>(null);
  const [pricing, setPricing] = useState<ValuedHolding | null>(null);
  const [dividend, setDividend] = useState<ValuedHolding | null>(null);
  const [fxCurrency, setFxCurrency] = useState<ForeignCurrency | null>(null);

  const twd = (value: number) => format.number(value, moneyFormat(BASE_CURRENCY));
  const signed = (value: number) => format.number(value, signedMoneyFormat(BASE_CURRENCY));

  const open = props.valued.filter((holding) => holding.quantity > 0);
  const closed = props.valued.filter((holding) => holding.quantity === 0);
  const hasUsHolding = open.some((holding) => holding.market === "US");

  // In the order they were first bought, so adding a holding doesn't repaint the others.
  const holdingColor = (key: string) => {
    const index = props.valued.findIndex((holding) => `${holding.market}:${holding.symbol}` === key);
    return SERIES_COLORS[index] ?? OTHER_COLOR;
  };
  const marketColor = (key: string) => SERIES_COLORS[MARKETS.indexOf(key as Market)] ?? OTHER_COLOR;

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm">{t("disclaimer")}</p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" className="h-11 gap-1.5 px-4" onClick={() => setTradeDialog({ trade: null })}>
          <Plus className="size-4" aria-hidden="true" />
          {t("newTrade")}
        </Button>
        <Button type="button" variant="outline" disabled={pending} className="h-11 gap-1.5 px-4" onClick={() => run(() => refreshMarketAction({ force: true }))}>
          <RefreshCw className="size-4" aria-hidden="true" />
          {pending ? t("refreshing") : t("refreshPrices")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <section aria-label={t("totalsLabel")} className="grid grid-cols-2 gap-2">
        <Tile label={t("marketValue")} value={twd(props.totals.value_twd)} />
        <Tile label={t("unrealized")} value={signed(props.totals.unrealized_twd)} />
        <Tile label={t("realized")} value={signed(props.totals.realized_twd)} />
        <Tile label={t("dividends")} value={twd(props.dividendsTwd)} />
      </section>

      {props.totals.unpriced > 0 && <p className="text-sm text-muted-foreground">{t("unpricedNote", { count: props.totals.unpriced })}</p>}
      {!props.hasUsSource && hasUsHolding && <p className="text-sm text-muted-foreground">{t("noUsSource")}</p>}

      <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="text-base font-semibold">{t("holdings")}</h2>
        {open.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("noHoldings")}</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {open.map((holding) => (
              <HoldingCard
                key={`${holding.market}:${holding.symbol}`}
                holding={holding}
                dividends={props.dividendsByHolding[`${holding.market}:${holding.symbol}`] ?? 0}
                onSetPrice={() => setPricing(holding)}
                onDividend={() => setDividend(holding)}
              />
            ))}
          </ul>
        )}
        {closed.length > 0 && (
          <details className="mt-2 text-sm">
            <summary className="flex min-h-10 cursor-pointer items-center text-muted-foreground">{t("soldHoldings", { count: closed.length })}</summary>
            <ul className="flex flex-col gap-1">
              {closed.map((holding) => (
                <li key={`${holding.market}:${holding.symbol}`} className="flex justify-between gap-2 text-xs tabular-nums">
                  <span>{holding.symbol}</span>
                  <span>
                    {t("realized")} {signed(holding.realized_twd)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {open.length > 0 && (
        <section className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <h2 className="text-base font-semibold">{t("allocation")}</h2>
          <AllocationBar title={t("byMarket")} slices={props.byMarket.map((slice) => ({ ...slice, label: t(`markets.${slice.key}`) }))} colorOf={marketColor} />
          <AllocationBar title={t("byHolding")} slices={props.byHolding} colorOf={holdingColor} />
        </section>
      )}

      <section className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="text-base font-semibold">{t("valueHistory")}</h2>
        {props.snapshots.length < 2 ? (
          <p className="text-sm text-muted-foreground">{t("noHistory")}</p>
        ) : (
          <ValueHistoryChart data={props.snapshots} />
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="text-base font-semibold">{t("exchangeRates")}</h2>
        <ul className="flex flex-col divide-y">
          {FOREIGN_CURRENCIES.map((currency) => {
            const rate = props.rates.find((row) => row.currency === currency);
            return (
              <li key={currency} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <p className="tabular-nums">
                    {rate ? t("rateLine", { currency, rate: format.number(rate.rate, { maximumFractionDigits: 6 }) }) : t("rateMissing", { currency })}
                  </p>
                  {rate && (
                    <p className="text-xs text-muted-foreground">
                      {t(rate.source === "manual" ? "rateManual" : "rateFetched", {
                        date: format.dateTime(toUtcDate(rate.rate_date), shortDateFormat),
                      })}
                    </p>
                  )}
                </div>
                <Button type="button" variant="outline" className="h-10 shrink-0 px-3" aria-label={t("setRateFor", { currency })} onClick={() => setFxCurrency(currency)}>
                  {t("setRate")}
                </Button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="text-base font-semibold">{t("trades")}</h2>
        {props.trades.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noTrades")}</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {props.trades.map((trade) => {
              const label = `${t(trade.side)} ${trade.symbol}`;
              return (
                <li key={trade.id} className="flex items-center gap-1 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium break-words">{label}</p>
                    <p className="text-xs break-words text-muted-foreground tabular-nums">
                      {[
                        format.dateTime(toUtcDate(trade.date), { dateStyle: "medium", timeZone: "UTC" }),
                        `${format.number(trade.quantity, { maximumFractionDigits: 6 })} × ${format.number(trade.price, moneyFormat(trade.currency))}`,
                        trade.fee > 0 ? t("feeLine", { fee: format.number(trade.fee, moneyFormat(trade.currency)) }) : null,
                        trade.note,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <Button type="button" variant="ghost" className="size-10" aria-label={t("editTradeNamed", { trade: label })} onClick={() => setTradeDialog({ trade })}>
                    <Pencil className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="size-10 text-destructive"
                    disabled={pending}
                    aria-label={t("deleteTradeNamed", { trade: label })}
                    onClick={() => {
                      if (window.confirm(t("deleteTradeConfirm", { trade: label }))) run(() => deleteTradeAction({ id: trade.id }));
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {tradeDialog && <TradeDialog trade={tradeDialog.trade} rates={props.rates} today={props.today} onClose={() => setTradeDialog(null)} />}
      {pricing && <PriceDialog holding={pricing} onClose={() => setPricing(null)} />}
      {dividend && <DividendDialog holding={dividend} today={props.today} onClose={() => setDividend(null)} />}
      {fxCurrency && <FxDialog currency={fxCurrency} onClose={() => setFxCurrency(null)} />}
    </div>
  );
}
