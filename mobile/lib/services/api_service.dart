import 'dart:io';
import 'package:dio/dio.dart';
import '../models/ocr_result.dart';
import '../models/profile.dart';

class ApiService {
  late Dio _dio;
  String _baseUrl = '';
  String _token = '';

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

  Future<OcrResult> extractMrz(File imageFile) async {
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(
        imageFile.path,
        filename: imageFile.path.split('/').last,
      ),
    });
    final resp = await _dio.post('/ocr/extract', data: formData);
    return OcrResult.fromJson(resp.data);
  }

  Future<Profile> createProfile(Map<String, dynamic> data) async {
    final resp = await _dio.post('/profiles', data: data);
    return Profile.fromJson(resp.data);
  }

  Future<List<Profile>> listProfiles() async {
    final resp = await _dio.get('/profiles');
    final list = resp.data as List;
    return list.map((p) => Profile.fromJson(p)).toList();
  }
}
