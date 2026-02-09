# Finding Taxonomy - Controlled Vocabulary

This document defines the allowed values for finding classification fields used in admin filtering and reporting.

## system_group

The electrical system or component category. Allowed values (lowercase, underscore-separated):

- `switchboard` - Main switchboard, service fuses, main isolation, distribution boards
- `earthing` - Earthing systems, MEN links, earth electrodes, bonding
- `rcd` - RCD/RCBO protection devices, RCD testing, residual current protection
- `lighting` - Lighting fixtures, lamps, switches, exterior lighting
- `power` - Power points (GPOs), outlets, sockets, final subcircuits
- `smoke_alarm` - Smoke alarms, fire detection systems, life safety devices
- `roof_space` - Roof space electrical, transformers, insulation contact
- `thermal` - Thermal issues, overheating, heat damage, hotspots
- `appliances` - Fixed appliances (cooktops, ovens, rangehoods, dishwashers, etc.)
- `cabling` - Cables, wiring, insulation, flexible leads, connections
- `other` - Other or unclassified findings

## space_group

The physical location or area where the finding occurs. Allowed values (lowercase, underscore-separated):

- `kitchen` - Kitchen areas
- `bathroom` - Bathroom, wet areas, showers
- `living` - Living areas, common spaces
- `bedroom` - Bedrooms
- `exterior` - Exterior, outdoor areas
- `roof_space` - Roof space, ceiling voids, attic
- `switchboard_area` - Switchboard location, meter box area
- `laundry` - Laundry areas
- `garage` - Garage, carport
- `general` - General areas, multiple locations, or unclassified

## tags

An array of searchable tags (lowercase, underscore-separated). Common tags include:

- `safety` - Safety-related findings
- `compliance` - Compliance or regulatory issues
- `thermal` - Thermal or overheating issues
- `moisture` - Moisture or water-related issues
- `cabling` - Cable or wiring issues
- `switchboard` - Switchboard-related
- `earthing` - Earthing-related
- `rcd` - RCD-related
- `lighting` - Lighting-related
- `power` - Power point or outlet-related
- `appliance` - Appliance-related
- `urgent` - Urgent or immediate priority
- `budget` - Budget or cost-related
- `legacy` - Legacy or old equipment
- `hazard` - Hazardous materials or conditions

**Tag conventions:**
- Use 3-8 tags per finding for better searchability
- Tags should be predictable and consistent
- Prefer existing tags over creating new ones
- Tags are additive (all matching rules apply)

## Classification Rules

1. **system_group**: First-match wins based on finding ID keywords
2. **space_group**: First-match wins based on finding ID keywords
3. **tags**: All matching keyword rules apply (additive)

## Seed Behavior

- Seed script (`db-seed-findings.ts`) uses `classifyFinding()` to auto-classify all findings
- If a finding already exists with `source='manual'`, classification fields are NOT overwritten
- All other findings get classification from `classifyFinding()` function
- Empty or null values are replaced with defaults: `system_group='other'`, `space_group='general'`, `tags=[]`

## Examples

```yaml
# Example finding with complete classification
GPO_MECHANICAL_LOOSE:
  system_group: power
  space_group: general
  tags:
    - safety
    - power
    - compliance

# Example finding with location-specific classification
BATHROOM_RCD_MISSING:
  system_group: rcd
  space_group: bathroom
  tags:
    - safety
    - rcd
    - compliance
    - moisture
```
