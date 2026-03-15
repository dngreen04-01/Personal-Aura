import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { colors, spacing, radius, fonts } from '../lib/theme';
import {
  fetchSharedLocations, contributeEquipment, reportMissingEquipment,
  claimSharedLocation,
} from '../lib/api';
import SearchBar from '../components/progress/SearchBar';
import SharedLocationDetail from '../components/SharedLocationDetail';

export default function SharedLocationsScreen() {
  const router = useRouter();
  const [locations, setLocations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [userLocation, setUserLocation] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const searchTimerRef = useRef(null);

  useEffect(() => {
    requestLocationAndLoad();
  }, []);

  const requestLocationAndLoad = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        // Still load with search-only mode
        await loadLocations(null);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setUserLocation(loc.coords);
      await loadLocations(loc.coords);
    } catch (e) {
      console.error('Location error:', e);
      setPermissionDenied(true);
      await loadLocations(null);
    }
  };

  const loadLocations = async (coords, search) => {
    setIsLoading(true);
    try {
      const params = {};
      if (coords) {
        params.lat = coords.latitude;
        params.lon = coords.longitude;
      }
      if (search) params.search = search;
      const data = await fetchSharedLocations(params);
      setLocations(data.locations || []);
    } catch (e) {
      console.error('Failed to load shared locations:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = useCallback((text) => {
    setSearchText(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      loadLocations(userLocation, text);
    }, 300);
  }, [userLocation]);

  const handleClaim = async (locationId) => {
    try {
      await claimSharedLocation(locationId);
      Alert.alert('Claimed!', 'You are now a contributor to this gym.');
      setSelectedLocation(null);
      loadLocations(userLocation, searchText);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  const handleContribute = async (locationId, equipmentId) => {
    try {
      await contributeEquipment(locationId, equipmentId);
      // Refresh detail
      const data = await fetchSharedLocations(
        userLocation
          ? { lat: userLocation.latitude, lon: userLocation.longitude, search: searchText }
          : { search: searchText }
      );
      const updated = (data.locations || []).find(l => l.id === locationId);
      if (updated) setSelectedLocation(updated);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  const handleReportMissing = async (locationId, equipmentId) => {
    try {
      await reportMissingEquipment(locationId, equipmentId);
      Alert.alert('Reported', 'Thanks for keeping equipment info accurate.');
      const data = await fetchSharedLocations(
        userLocation
          ? { lat: userLocation.latitude, lon: userLocation.longitude, search: searchText }
          : { search: searchText }
      );
      const updated = (data.locations || []).find(l => l.id === locationId);
      if (updated) setSelectedLocation(updated);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  const renderLocation = useCallback(({ item }) => (
    <TouchableOpacity
      style={styles.locationCard}
      onPress={() => setSelectedLocation(item)}
      activeOpacity={0.7}
    >
      <View style={styles.locationIcon}>
        <MaterialIcons name="location-city" size={22} color={colors.primary} />
      </View>
      <View style={styles.locationInfo}>
        <View style={styles.nameRow}>
          <Text style={styles.locationName} numberOfLines={1}>{item.name}</Text>
          {item.verified && (
            <MaterialIcons name="verified" size={14} color="#22c55e" />
          )}
        </View>
        {item.address ? (
          <Text style={styles.locationAddress} numberOfLines={1}>{item.address}</Text>
        ) : null}
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>
            {(item.equipment || []).length} equipment
          </Text>
          <Text style={styles.metaDot}>&middot;</Text>
          <Text style={styles.metaText}>
            {(item.contributors || []).length} contributor{(item.contributors || []).length !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>
      {item.distance != null && (
        <View style={styles.distanceBadge}>
          <Text style={styles.distanceText}>{item.distance.toFixed(1)} km</Text>
        </View>
      )}
    </TouchableOpacity>
  ), []);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <MaterialIcons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nearby Gyms</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Search */}
      <View style={styles.searchSection}>
        <SearchBar value={searchText} onChangeText={handleSearch} placeholder="Search gyms..." />
        {permissionDenied && (
          <View style={styles.permissionNote}>
            <MaterialIcons name="info-outline" size={14} color={colors.textMuted} />
            <Text style={styles.permissionText}>
              Location access denied — showing search results only
            </Text>
          </View>
        )}
      </View>

      {/* Location List */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Finding gyms nearby...</Text>
        </View>
      ) : locations.length === 0 ? (
        <View style={styles.centered}>
          <MaterialIcons name="location-off" size={48} color={colors.textSecondary} />
          <Text style={styles.emptyText}>No gyms found</Text>
          <Text style={styles.emptySubtext}>
            {searchText ? 'Try a different search term' : 'Be the first to add your gym!'}
          </Text>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => {
              Alert.alert(
                'Coming Soon',
                'Create a shared gym from your Locations screen by toggling "Share with community" when adding a location.'
              );
            }}
            activeOpacity={0.85}
          >
            <MaterialIcons name="add-location-alt" size={18} color={colors.bgDark} />
            <Text style={styles.createButtonText}>Create New Gym</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={locations}
          keyExtractor={(item) => item.id}
          renderItem={renderLocation}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Detail Modal */}
      <SharedLocationDetail
        location={selectedLocation}
        visible={!!selectedLocation}
        onClose={() => setSelectedLocation(null)}
        onClaim={handleClaim}
        onContribute={handleContribute}
        onReportMissing={handleReportMissing}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDark },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerTitle: {
    ...fonts.bold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  searchSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  permissionNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.xs,
  },
  permissionText: {
    ...fonts.regular,
    fontSize: 11,
    color: colors.textMuted,
  },
  listContent: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  locationIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryGhost,
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationInfo: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationName: {
    ...fonts.semibold,
    fontSize: 15,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  locationAddress: {
    ...fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  metaText: {
    ...fonts.regular,
    fontSize: 11,
    color: colors.textMuted,
  },
  metaDot: {
    ...fonts.regular,
    fontSize: 11,
    color: colors.textMuted,
  },
  distanceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryGhost,
  },
  distanceText: {
    ...fonts.semibold,
    fontSize: 11,
    color: colors.primary,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  loadingText: {
    ...fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyText: {
    ...fonts.bold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  emptySubtext: {
    ...fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.lg,
    marginTop: spacing.sm,
  },
  createButtonText: {
    ...fonts.bold,
    fontSize: 14,
    color: colors.bgDark,
  },
});
