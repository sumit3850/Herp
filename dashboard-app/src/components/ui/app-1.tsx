"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  BarChart3,
  Bell,
  ClipboardList,
  FileText,
  Search,
  Users,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/app-1-utils/sidebar";

import {
  app1Activity,
  app1Chart,
  app1ChartConfig,
  app1Projects,
  app1User,
} from "@/components/ui/app-1-utils/app-1-data";
import { App1Sidebar } from "@/components/ui/app-1-utils/app-1-sidebar";

const STATS = [
  {
    label: "Total projects",
    value: "24",
    hint: "+2 from last month",
    icon: FileText,
  },
  {
    label: "Active tasks",
    value: "127",
    hint: "+12 from yesterday",
    icon: ClipboardList,
  },
  { label: "Team members", value: "16", hint: "+1 new member", icon: Users },
  {
    label: "Completion rate",
    value: "87%",
    hint: "+5% from last week",
    icon: BarChart3,
  },
];

const STATUS_VARIANT = {
  "In progress": "default",
  "In review": "secondary",
  Planning: "outline",
} as const;

export function App1() {
  return (
    <SidebarProvider>
      <App1Sidebar />
      {/*
        min-w-0: the inset is a flex item, and a flex item's min-width is `auto`, so it
        refuses to shrink below the min-content width of the widest thing inside it. At
        tablet widths, where the sidebar becomes permanent, that pushed the inset ~23px
        past the viewport and ate the right padding off every card.
      */}
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background px-4 sm:px-6">
          <SidebarTrigger aria-label="Toggle navigation" />
          <h1 className="truncate text-lg font-semibold">
            Welcome back, {app1User.name.split(" ")[0]}
          </h1>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Search">
              <Search />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Bell />
            </Button>
            <Avatar className="ml-1 size-8">
              <AvatarImage
                src={app1User.avatar}
                alt={app1User.name}
                className="object-[50%_15%]"
              />
              <AvatarFallback>{app1User.initials}</AvatarFallback>
            </Avatar>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {STATS.map((stat) => (
              <Card key={stat.label}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-medium">
                    {stat.label}
                  </CardTitle>
                  <stat.icon
                    aria-hidden
                    className="size-5 text-muted-foreground"
                  />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold tabular-nums">
                    {stat.value}
                  </p>
                  <p className="text-xs text-muted-foreground">{stat.hint}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Task throughput</CardTitle>
              <CardDescription>
                Tasks opened against tasks completed over the last eight weeks
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* ChartContainer supplies the responsive wrapper and the CSS variables the series read. */}
              <ChartContainer config={app1ChartConfig} className="h-64 w-full">
                <AreaChart
                  data={app1Chart}
                  margin={{ left: 4, right: 4, top: 8 }}
                  accessibilityLayer
                >
                  <defs>
                    <linearGradient
                      id="app1Completed"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="var(--color-completed)"
                        stopOpacity={0.25}
                      />
                      <stop
                        offset="100%"
                        stopColor="var(--color-completed)"
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="week"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                  />
                  <YAxis tickLine={false} axisLine={false} width={32} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  {/* The two series separate by form, not by luminance, so they stay readable in both themes. */}
                  <Area
                    dataKey="opened"
                    type="monotone"
                    stroke="var(--color-opened)"
                    strokeDasharray="4 4"
                    fill="none"
                    strokeWidth={2}
                  />
                  <Area
                    dataKey="completed"
                    type="monotone"
                    stroke="var(--color-completed)"
                    fill="url(#app1Completed)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Active projects</CardTitle>
                <CardDescription>Your current project progress</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                {app1Projects.map((project) => (
                  <div key={project.id} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate text-sm font-medium">
                        {project.name}
                      </h3>
                      <Badge variant={STATUS_VARIANT[project.status]}>
                        {project.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {project.description}
                    </p>
                    <div className="flex items-center gap-3">
                      <Progress
                        value={project.progress}
                        aria-label={`${project.name} progress`}
                      />
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {project.progress}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1">
                        {project.team.map((member) => (
                          <Avatar key={member.name} className="size-6">
                            <AvatarImage
                              src={member.avatar}
                              alt={member.name}
                              className="object-[50%_15%]"
                            />
                            <AvatarFallback className="text-[10px]">
                              {member.initials}
                            </AvatarFallback>
                          </Avatar>
                        ))}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Due {project.dueDate}
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent activity</CardTitle>
                <CardDescription>Latest updates from your team</CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="flex flex-col gap-4">
                  {app1Activity.map((entry) => (
                    <li key={entry.id} className="flex items-start gap-3">
                      <Avatar className="size-8">
                        <AvatarImage
                          src={entry.person.avatar}
                          alt={entry.person.name}
                          className="object-[50%_15%]"
                        />
                        <AvatarFallback className="text-xs">
                          {entry.person.initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug">
                          <span className="font-medium">
                            {entry.person.name}
                          </span>{" "}
                          <span className="text-muted-foreground">
                            {entry.action}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {entry.time}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default App1;
