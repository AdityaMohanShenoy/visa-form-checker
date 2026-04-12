class MrzFields {
  final String? surname;
  final String? givenNames;
  final String? passportNumber;
  final String? nationality;
  final String? dateOfBirth;
  final String? gender;
  final String? expiryDate;
  final String? issuingCountry;
  final String? documentType;

  MrzFields({
    this.surname,
    this.givenNames,
    this.passportNumber,
    this.nationality,
    this.dateOfBirth,
    this.gender,
    this.expiryDate,
    this.issuingCountry,
    this.documentType,
  });

  factory MrzFields.fromJson(Map<String, dynamic> json) {
    return MrzFields(
      surname: json['surname'],
      givenNames: json['given_names'],
      passportNumber: json['passport_number'],
      nationality: json['nationality'],
      dateOfBirth: json['date_of_birth'],
      gender: json['gender'],
      expiryDate: json['expiry_date'],
      issuingCountry: json['issuing_country'],
      documentType: json['document_type'],
    );
  }

  Map<String, String?> toMap() => {
        'surname': surname,
        'given_names': givenNames,
        'passport_number': passportNumber,
        'nationality': nationality,
        'date_of_birth': dateOfBirth,
        'gender': gender,
        'expiry_date': expiryDate,
        'issuing_country': issuingCountry,
        'document_type': documentType,
      };
}

class MrzResult {
  final bool success;
  final String? raw;
  final MrzFields? fields;
  final String? error;

  MrzResult({
    required this.success,
    this.raw,
    this.fields,
    this.error,
  });

  factory MrzResult.fromJson(Map<String, dynamic> json) {
    return MrzResult(
      success: json['success'] ?? false,
      raw: json['raw'],
      fields:
          json['fields'] != null ? MrzFields.fromJson(json['fields']) : null,
      error: json['error'],
    );
  }
}

class OcrResult {
  final MrzResult mrz;
  final String? imageHash;

  OcrResult({required this.mrz, this.imageHash});

  factory OcrResult.fromJson(Map<String, dynamic> json) {
    return OcrResult(
      mrz: MrzResult.fromJson(json['mrz']),
      imageHash: json['image_hash'],
    );
  }
}
