"""Shared SQLAlchemy column types, including PostGIS geometry wrappers."""

from geoalchemy2 import Geography
from sqlalchemy import CHAR

# SRID 4326 is WGS84, the only SRID accepted by OpenStreetMap and GeoJSON clients.
SRID_WGS84 = 4326

PointType = Geography(
    geometry_type="POINT",
    spatial_index=False,
    srid=SRID_WGS84,
    dimension=2,
)

RouteLineType = Geography(
    geometry_type="LINESTRING",
    spatial_index=False,
    srid=SRID_WGS84,
    dimension=2,
)

# ISO 3166-1 alpha-2 country code; CHAR(2) keeps comparisons free of padding.
CountryCode = CHAR(2)
