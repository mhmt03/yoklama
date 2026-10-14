using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using OgretmenAjanda.Api.Models;

namespace OgretmenAjanda.Api.Services
{
    public interface ITokenService
    {
        string GenerateToken(User user, string? schoolCode = null);
    }

    public class TokenService : ITokenService
    {
        private readonly IConfiguration _config;

        public TokenService(IConfiguration config)
        {
            _config = config;
        }

        public string GenerateToken(User user, string? schoolCode = null)
        {
            var jwtKey = _config["Jwt:Key"] ?? "OgretmenAjandaSuperSecretSecurityKey2026!XYZ";
            var issuer = _config["Jwt:Issuer"] ?? "OgretmenAjandaApi";
            var audience = _config["Jwt:Audience"] ?? "OgretmenAjandaClient";

            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Name, user.Username),
                new Claim(ClaimTypes.Role, user.Role),
                new Claim("FullName", user.FullName),
            };

            if (user.SchoolId.HasValue)
            {
                claims.Add(new Claim("SchoolId", user.SchoolId.Value.ToString()));
            }

            if (!string.IsNullOrEmpty(schoolCode))
            {
                claims.Add(new Claim("SchoolCode", schoolCode));
            }

            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var token = new JwtSecurityToken(
                issuer: issuer,
                audience: audience,
                claims: claims,
                expires: DateTime.UtcNow.AddDays(365), // Mobil kullanım için uzun ömürlü token
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}
