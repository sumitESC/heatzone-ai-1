import { pgTable, serial, text, real, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { citiesTable } from "./cities";

export const weatherDataTable = pgTable("weather_data", {
  id: serial("id").primaryKey(),
  cityId: integer("city_id").notNull().references(() => citiesTable.id),
  temperature: real("temperature").notNull(),
  feelsLike: real("feels_like").notNull(),
  humidity: integer("humidity").notNull(),
  windSpeed: real("wind_speed").notNull(),
  pressure: integer("pressure").notNull(),
  cloudCover: integer("cloud_cover").notNull(),
  rainfall: real("rainfall").notNull().default(0),
  uvIndex: real("uv_index"),
  weatherMain: text("weather_main").notNull(),
  weatherDescription: text("weather_description").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWeatherSchema = createInsertSchema(weatherDataTable).omit({ id: true, recordedAt: true });
export type InsertWeather = z.infer<typeof insertWeatherSchema>;
export type WeatherData = typeof weatherDataTable.$inferSelect;
