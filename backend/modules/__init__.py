# -*- coding: utf-8 -*-
"""
Доменные модули backend (логическое разделение).

nutrition   → backend.services.food_service, nutrition_analysis
workouts    → backend.services.strength_service, exercise_service
bike        → backend.services.cardio_service, bike_power_service
body        → backend.services.body_service, weight router
sync        → backend.services.integration_sync_service, routers.sync
settings    → backend.services.settings_service, user_service
analytics   → backend.services.analytics_service, core.genetic_potential
"""
