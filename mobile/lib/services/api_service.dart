import 'dart:io';
import 'package:dio/dio.dart';
import '../models/ocr_result.dart';
import '../models/profile.dart';
import 'backend_discovery.dart';

/// A backend failure phrased so the person holding the phone knows what to do.
///
/// Screens interpolate the caught error directly (`'Upload failed: $e'`), so
/// [toString] is the user-facing text — it starts lowercase to read after those
/// prefixes, and deliberately leaks no Dio internals.
class BackendException implements Exception {
  final String message;
  const BackendException(this.message);

  /// Returns null for failures the user can't act on, so the raw error still
  /// surfaces rather than being papered over with a wrong explanation.
  static BackendException? from(DioException e, String baseUrl) {
    switch (e.type) {
      case DioExceptionType.connectionError:
      case DioExceptionType.connectionTimeout:
        return BackendException(
          "can't reach the PC at $baseUrl, and nothing else on this network "
          'answered either. Check that the backend is running and that both '
          'devices are on the same WiFi.',
        );
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return const BackendException(
          'the PC stopped responding. It may still be processing the image — '
          'wait a moment and try again.',
        );
      case DioExceptionType.badResponse:
        if (e.response?.statusCode == 401) {
          return const BackendException(
            "the PC's auth token no longer matches. Re-scan the QR code from "
            'the Chrome extension to pair again.',
          );
        }
        return null;
      default:
        return null;
    }
  }

  @override
  String toString() => message;
}

class ApiService {
  late Dio _dio;
  String _baseUrl = '';
  String _token = '';

  /// Called when the backend was found at a new address, so the caller can
  /// persist it. Signature matches [ConnectionStore.save].
  Future<void> Function(String url, String token)? onRediscovered;

  bool get isConfigured => _baseUrl.isNotEmpty && _token.isNotEmpty;

  void configure(String baseUrl, String token) {
    _baseUrl = baseUrl;
    _token = token;
    _dio = Dio(BaseOptions(
      baseUrl: '$baseUrl/api/v1',
      headers: {'Authorization': 'Bearer $token'},
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 90),
    ));
  }

  /// Runs [call], and if the PC is unreachable, looks for it at a new address
  /// and retries once. This is what makes a changed IP self-healing: the URL
  /// from the pairing QR is a cache, not the source of truth.
  Future<T> _guard<T>(Future<T> Function() call) async {
    try {
      return await call();
    } on DioException catch (e) {
      if (e.type == DioExceptionType.connectionError ||
          e.type == DioExceptionType.connectionTimeout) {
        final moved = await _rediscover();
        if (moved != null) {
          configure(moved, _token);
          await onRediscovered?.call(moved, _token);
          try {
            return await call();
          } on DioException catch (retry) {
            throw BackendException.from(retry, _baseUrl) ?? retry;
          }
        }
      }
      throw BackendException.from(e, _baseUrl) ?? e;
    }
  }

  /// Scans the network for the backend, returning its URL if it has moved.
  Future<String?> _rediscover() async {
    final uri = Uri.tryParse(_baseUrl);
    if (uri == null || uri.host.isEmpty) return null;
    final found = await BackendDiscovery.find(
      port: uri.hasPort ? uri.port : 5050,
      fallbackPrefix: BackendDiscovery.prefixOf(uri.host),
    );
    return found == _baseUrl ? null : found;
  }

  Future<bool> healthCheck() async {
    try {
      final resp = await Dio(BaseOptions(
        connectTimeout: const Duration(seconds: 5),
      )).get('$_baseUrl/api/v1/health');
      return resp.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  Future<OcrResult> extractMrz(File imageFile) => _guard(() async {
        final formData = FormData.fromMap({
          'file': await MultipartFile.fromFile(
            imageFile.path,
            filename: imageFile.path.split('/').last,
          ),
        });
        final resp = await _dio.post('/ocr/extract', data: formData);
        return OcrResult.fromJson(resp.data);
      });

  Future<Profile> createProfile(Map<String, dynamic> data) => _guard(() async {
        final resp = await _dio.post('/profiles', data: data);
        return Profile.fromJson(resp.data);
      });

  Future<List<Profile>> listProfiles() => _guard(() async {
        final resp = await _dio.get('/profiles');
        final list = resp.data as List;
        return list.map((p) => Profile.fromJson(p)).toList();
      });
}
