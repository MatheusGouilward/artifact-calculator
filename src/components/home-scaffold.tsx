"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const setupSchema = z.object({
  buildName: z.string().trim().min(2, "Build name must have at least 2 characters."),
  sandsMainStat: z.enum(["ATK%", "HP%", "DEF%", "Elemental Mastery"]),
  includeCritCirclet: z.boolean(),
});

type SetupValues = z.infer<typeof setupSchema>;

const defaultValues: SetupValues = {
  buildName: "",
  sandsMainStat: "ATK%",
  includeCritCirclet: true,
};

export function HomeScaffold() {
  const [savedMessage, setSavedMessage] = useState("");

  const form = useForm<SetupValues>({
    defaultValues,
    resolver: zodResolver(setupSchema),
  });

  const submit = (values: SetupValues) => {
    const circlet = values.includeCritCirclet ? "with Crit circlet" : "without Crit circlet";
    setSavedMessage(`${values.buildName} saved (${values.sandsMainStat} sands, ${circlet}).`);
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-4 md:p-8">
      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Genshin Calculator</h1>
          <Badge variant="secondary">Scaffold</Badge>
        </div>
        <p className="text-muted-foreground">
          Starter workspace for artifacts and build calculations.
        </p>
      </header>

      <Separator />

      <Tabs defaultValue="setup" className="w-full">
        <TabsList>
          <TabsTrigger value="setup">Build Setup</TabsTrigger>
          <TabsTrigger value="roadmap">Roadmap</TabsTrigger>
        </TabsList>

        <TabsContent value="setup">
          <Card>
            <CardHeader>
              <CardTitle>Quick Build Setup</CardTitle>
              <CardDescription>Minimal form powered by react-hook-form + zod.</CardDescription>
            </CardHeader>
            <CardContent>
              <form id="build-setup-form" className="space-y-4" onSubmit={form.handleSubmit(submit)}>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="buildName">
                    Build name
                  </label>
                  <Input
                    id="buildName"
                    aria-invalid={Boolean(form.formState.errors.buildName)}
                    placeholder="Raiden Hypercarry"
                    {...form.register("buildName")}
                  />
                  {form.formState.errors.buildName && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.buildName.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Sands main stat</label>
                  <Controller
                    control={form.control}
                    name="sandsMainStat"
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select main stat" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ATK%">ATK%</SelectItem>
                          <SelectItem value="HP%">HP%</SelectItem>
                          <SelectItem value="DEF%">DEF%</SelectItem>
                          <SelectItem value="Elemental Mastery">Elemental Mastery</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <Controller
                    control={form.control}
                    name="includeCritCirclet"
                    render={({ field }) => (
                      <Checkbox
                        id="includeCritCirclet"
                        checked={field.value}
                        onCheckedChange={(checked) => field.onChange(checked === true)}
                      />
                    )}
                  />
                  <label className="text-sm" htmlFor="includeCritCirclet">
                    Include Crit circlet assumption
                  </label>
                </div>
              </form>
            </CardContent>
            <CardFooter className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button type="submit" form="build-setup-form">
                Save setup
              </Button>
              {savedMessage && (
                <p className="text-sm text-muted-foreground" data-testid="saved-message">
                  {savedMessage}
                </p>
              )}
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="roadmap">
          <Card>
            <CardHeader>
              <CardTitle>Next Steps</CardTitle>
              <CardDescription>Suggested modules to implement next.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>1. Artifact roll simulator in `src/lib/genshin/artifacts`.</p>
              <p>2. Team rotation and buff timeline modeling.</p>
              <p>3. Damage formula validation tests.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  );
}
