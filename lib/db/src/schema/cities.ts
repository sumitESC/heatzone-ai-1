import { pgTable, serial, text, real, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const citiesTable = pgTable("cities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  population: integer("population").notNull(),
  populationDensity: real("population_density").notNull(),
  totalArea: real("total_area").notNull(),
  builtUpArea: real("built_up_area").notNull(),
  industrialArea: real("industrial_area").notNull(),
  residentialArea: real("residential_area").notNull(),
  roadArea: real("road_area").notNull(),
  openLand: real("open_land").notNull(),
  forestCover: real("forest_cover").notNull(),
  urbanGreenSpace: real("urban_green_space").notNull(),
  treeDensity: real("tree_density").notNull(),
  ndvi: real("ndvi").notNull(),
  totalVehicles: integer("total_vehicles").notNull(),
  petrolVehicles: integer("petrol_vehicles").notNull(),
  dieselVehicles: integer("diesel_vehicles").notNull(),
  electricVehicles: integer("electric_vehicles").notNull(),
  cngVehicles: integer("cng_vehicles").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCitySchema = createInsertSchema(citiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCity = z.infer<typeof insertCitySchema>;
export type City = typeof citiesTable.$inferSelect;
