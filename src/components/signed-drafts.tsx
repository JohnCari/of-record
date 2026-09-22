"use client";

import { useQuery } from "convex/react";
import { Stamp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Empty } from "@/components/workspace/placeholders";
import { readOwnCases } from "@/lib/own-cases";
import { api } from "../../convex/_generated/api";

const COLUMNS = [
  { label: "Case", numeric: false },
  { label: "Signed", numeric: false },
  { label: "Sentences", numeric: true },
  { label: "Verified", numeric: true },
  { label: "Accepted by you", numeric: true },
  { label: "Struck by you", numeric: true },
  { label: "Cost", numeric: true },
];

/** Every draft signed on a case this browser can see, newest first. A row opens the draft as signed. */
export function SignedDrafts() {
  const router = useRouter();
  const [ownIds, setOwnIds] = useState<string[]>([]);
  useEffect(() => setOwnIds(readOwnCases()), []);
  const rows = useQuery(api.drafts.listSigned, { ownIds });

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8 lg:px-10">
        <div>
          <h1 className="font-serif text-2xl leading-tight">Signed drafts</h1>
          <p className="mt-2 text-muted-foreground">
            Each one was signed only after every sentence had passed a check or had your decision on
            it. Open one to read it as signed, or print it.
          </p>
        </div>

        {rows?.length === 0 ? (
          <div className="py-16">
            <Empty icon={Stamp}>No draft has been signed yet.</Empty>
          </div>
        ) : (
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  {COLUMNS.map((c) => (
                    <TableHead key={c.label} className={c.numeric ? "text-right" : undefined}>
                      {c.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows === undefined &&
                  [0, 1, 2].map((i) => (
                    <TableRow key={i}>
                      {COLUMNS.map((c) => (
                        <TableCell key={c.label}>
                          <Skeleton
                            className="h-4"
                            style={{ width: c.numeric ? "2.5rem" : "70%" }}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                {rows?.map((row) => (
                  <TableRow
                    key={row.draftId}
                    className="cursor-pointer"
                    onClick={() => router.push(`/?draft=${row.draftId}`)}
                  >
                    <TableCell>
                      <Link
                        href={{ pathname: "/", query: { draft: row.draftId } }}
                        className="font-medium outline-none focus-visible:underline"
                      >
                        {row.caption}
                      </Link>
                      <p className="text-xs text-muted-foreground">{row.motionTitle}</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {new Date(row.signedAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.sentences}</TableCell>
                    <TableCell className="text-right tabular-nums text-verified">
                      {row.verified}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.accepted > 0 ? (
                        <Badge variant="outline">{row.accepted}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.struck > 0 ? (
                        <Badge variant="outline">{row.struck}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      ${row.costUsd.toFixed(3)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}
