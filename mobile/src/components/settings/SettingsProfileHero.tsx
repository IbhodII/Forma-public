import React from 'react';

import {StyleSheet, Text, View} from 'react-native';

import {useQuery} from '@tanstack/react-query';

import Icon from 'react-native-vector-icons/Ionicons';



import {fetchUserProfile} from '../../api/user';
import {loadOnboardingPreferences} from '../../onboarding/storage';
import {resolveProfileSex} from '../../utils/profileSex';

import {AppHero} from '../../design-system/components/AppHero';

import {useDesignSystem} from '../../design-system/useDesignSystem';



export function SettingsProfileHero() {

  const {typography, heroText, space, iconSize, colors} = useDesignSystem();

  const profileQuery = useQuery({

    queryKey: ['user-profile'],

    queryFn: fetchUserProfile,

  });
  const onboardingPrefsQuery = useQuery({
    queryKey: ['onboarding-preferences'],
    queryFn: loadOnboardingPreferences,
    staleTime: Infinity,
  });

  const p = profileQuery.data;

  const normalizedSex = resolveProfileSex(p, onboardingPrefsQuery.data?.sex);
  const sexLabel =
    normalizedSex === 'female'
      ? 'Женский профиль'
      : normalizedSex === 'male'
        ? 'Мужской профиль'
        : 'Профиль';



  return (

    <AppHero compact style={{marginBottom: space[3]}}>

      <View style={styles.row}>

        <View style={[styles.avatar, {backgroundColor: colors.heroChipBg}]}>

          <Icon name="person" size={iconSize.lg} color={colors.heroText} />

        </View>

        <View style={styles.text}>

          <Text style={[typography.title1, heroText.title]}>Forma</Text>

          <Text style={[typography.bodyMedium, heroText.subtitle, styles.subline]}>{sexLabel}</Text>

          {p?.height_cm != null ? (

            <Text style={[typography.caption, heroText.muted, styles.meta]}>

              Рост {p.height_cm} см

              {p.max_heart_rate ? ` · Max HR ${p.max_heart_rate}` : ''}

            </Text>

          ) : (

            <Text style={[typography.caption, heroText.muted, styles.meta]}>Заполните профиль ниже</Text>

          )}

        </View>

      </View>

    </AppHero>

  );

}



const styles = StyleSheet.create({

  row: {flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1},

  avatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  text: {flex: 1, minWidth: 0, gap: 4},

  subline: {fontWeight: '600'},

  meta: {marginTop: 4},

});


