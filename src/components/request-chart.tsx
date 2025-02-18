import { RadialBar, RadialBarChart } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useContext, useMemo, useState } from "react";
import { RequestTrackingContext } from "@/lib/request-tracking-context";

const INITIAL_METHOD_NAMES = ["eth_accounts", "eth_blockNumber", "eth_call", "eth_chainId", "eth_getLogs"];

const chartConfig = {
  visitors: {
    label: "Visitors",
  },
  pending: {
    label: "Success",
    color: "#d0d0d0",
  },
  success: {
    label: "Success",
    color: "var(--chart-2)",
  },
  failure: {
    label: "Failure",
    color: "var(--chart-5)",
  },
  eth_accounts: {
    label: "eth_accounts",
    color: "var(--chart-1)",
  },
  eth_blockNumber: {
    label: "eth_blockNumber",
    color: "var(--chart-2)",
  },
  eth_call: {
    label: "eth_call",
    color: "var(--chart-3)",
  },
  eth_chainId: {
    label: "eth_chainId",
    color: "var(--chart-4)",
  },
  eth_getLogs: {
    label: "eth_getLogs",
    color: "var(--chart-5)",
  },
} satisfies ChartConfig;

// const chartConfig = {
//   pending: {
//     label: "Pending",
//     color: "#e6e6e6",
//   },
//   success: {
//     label: "Success",
//     color: "#00ff00",
//   },
//   failure: {
//     label: "Failure",
//     color: "#ff0000",
//   },
// } satisfies ChartConfig;

type ProviderName = string;
type MethodName = string;

function mapValues<T extends Record<PropertyKey, unknown>, U>(record: T, fn: (value: [keyof T, T[keyof T]]) => U) {
  const result = {} as { [K in keyof T]: U };
  for (const key of Object.keys(record) as (keyof T)[]) {
    result[key] = fn([key, record[key]]);
  }
  return result;
}

export function RequestChart() {
  const requests = useContext(RequestTrackingContext);

  const {
    providers,
    providerRequestCounts,
    barChartData: chartData,
  } = useMemo(() => {
    const providerRequestCounts: Record<ProviderName, number> = {};
    const methodRequestCounts: Record<
      ProviderName,
      Record<MethodName, { success: number; failure: number; pending: number }>
    > = {};

    requests.forEach((entry) => {
      providerRequestCounts[entry.provider] = (providerRequestCounts[entry.provider] ?? 0) + 1;

      const counts =
        methodRequestCounts[entry.provider] ??
        Object.fromEntries(INITIAL_METHOD_NAMES.map((method) => [method, { success: 0, failure: 0, pending: 0 }]));
      if (!(entry.method in counts)) {
        counts[entry.method] = { success: 0, failure: 0, pending: 0 };
      }
      switch (entry.responseStatus) {
        case undefined:
          counts[entry.method].pending += 1;
          break;
        case 200:
          counts[entry.method].success += 1;
          break;
        default:
          counts[entry.method].failure += 1;
      }
      methodRequestCounts[entry.provider] = counts;
    });

    // transform from provider→method→status→count to provider→method→{method, status, count, ...}[]
    const pieChartData = mapValues(methodRequestCounts, ([, allCounts]) =>
      mapValues(allCounts, ([method, counts]) =>
        Object.entries(counts).map(([responseStatus, count]) => {
          let fillOpacity: number;
          let mask: string | undefined;

          switch (responseStatus as keyof typeof counts) {
            case "pending":
              fillOpacity = 0.5;
              mask = undefined;
              break;
            case "success":
              fillOpacity = 1.0;
              mask = undefined;
              break;
            case "failure":
              fillOpacity = 1.0;
              mask = undefined; // "url(#stripesMask)";
              break;
          }

          return {
            method,
            responseStatus,
            count,
            fill: `var(--color-${responseStatus})`,
            fillOpacity,
            mask,
          };
        }),
      ),
    );

    // transform from provider→method→status→count to provider→{method, successes, failures, pending, ...}[]
    const barChartData = mapValues(methodRequestCounts, ([, allCounts]) =>
      Object.entries(allCounts)
        .map(([method, counts]) => {
          const total = Object.values(counts).reduce((a, b) => a + b, 0);
          const fractions = Object.fromEntries(
            Object.entries(counts).map(([responseStatus, count]) => [
              `${responseStatus}Fraction`,
              count / (total || 1),
            ]),
          ) as { [K in keyof typeof counts as `${K}Fraction`]: number };
          return { method, total, ...counts, ...fractions };
        })
        .sort((a, b) => a.method.localeCompare(b.method)),
    );

    return {
      providers: Array.from(Object.keys(providerRequestCounts)).sort(),
      providerRequestCounts,
      methodRequestCounts,
      barChartData,
      pieChartData,
    };
  }, [requests]);

  const [activeChart, setActiveChart] = useState(providers.at(0) ?? "Wallet");

  return (
    <Card>
      <CardHeader className="flex flex-col items-stretch space-y-0 border-b p-0 sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 py-5 sm:py-6">
          <CardTitle>EVM Requests</CardTitle>
          <CardDescription>Showing blockchain data requests for diagnostic purposes</CardDescription>
        </div>
        <div className="flex">
          {providers.map((provider) => {
            return (
              <button
                key={provider}
                data-active={activeChart === provider}
                className="data-[active=true]:bg-muted/50 flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 even:border-l sm:border-t-0 sm:border-l sm:px-8 sm:py-6"
                onClick={() => setActiveChart(provider)}
              >
                <span className="text-muted-foreground text-xs">{provider.replace("https://", "")}</span>
                <span className="text-lg leading-none font-bold sm:text-3xl">
                  {providerRequestCounts[provider].toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        <ChartContainer config={chartConfig} className="mx-auto aspect-square w-full max-w-[250px]">
          <RadialBarChart
            data={chartData[activeChart] ?? []}
            startAngle={180}
            endAngle={-180}
            innerRadius={0}
            outerRadius={125}
          >
            {/* <defs>
              <pattern id="stripes" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y="0" x2="0" y2="10" stroke="white" strokeWidth="10" />
              </pattern>
              <mask id="stripesMask">
                <rect x="0" y="0" width="100%" height="100%" fill="url(#stripes)" />
              </mask>
            </defs> */}
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelKey="method"
                  indicator="line"
                  valueFormatter={(_value, payload) => {
                    return (
                      payload.payload && payload.name ? (payload.payload[payload.name] as number) : 0
                    ).toLocaleString();
                  }}
                />
              }
            />
            <RadialBar
              dataKey="successFraction"
              name="success"
              stackId="a"
              fill="var(--color-success)"
              className="stroke-transparent stroke-2"
              background
            />
            <RadialBar
              dataKey="failureFraction"
              name="failure"
              stackId="a"
              fill="var(--color-failure)"
              className="stroke-transparent stroke-2"
            />
          </RadialBarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
